# Atlas — Developer Documentation

> A unified, single-page AI chat interface supporting multiple cloud providers and local in-browser models — with no build step, no backend, and no dependencies to install.


Live at: https://touhidsiddiqueeraj-bit.github.io/atlas/

---

## Table of Contents

- [Overview](#overview)
  - [Introduction](#introduction)
  - [Architecture](#architecture)
  - [Quick Start](#quick-start)
- [Core Systems](#core-systems)
  - [State Object (S)](#state-object-s)
  - [Storage Layer](#storage-layer)
  - [API Providers](#api-providers)
  - [Messaging Pipeline](#messaging-pipeline)
  - [Streaming](#streaming)
- [Features](#features)
  - [Skills System](#skills-system)
  - [Patch Edit System](#patch-edit-system)
  - [Artifact Panel](#artifact-panel)
  - [Output Formats](#output-formats)
  - [Image Generation](#image-generation)
  - [Tool Use](#tool-use)
  - [Cost Tracker](#cost-tracker)
  - [Clarifying Questions](#clarifying-questions)
- [Integrations](#integrations)
  - [Google Sign-In](#google-sign-in)
  - [Drive Chat History Sync](#drive-chat-history-sync)
  - [Local Model (WebGPU)](#local-model-webgpu)
  - [Web Search](#web-search)
- [UI Systems](#ui-systems)
  - [Settings Panel](#settings-panel)
  - [Sidebar & Conversations](#sidebar--conversations)
  - [Markdown Renderer](#markdown-renderer)
  - [Themes & Fonts](#themes--fonts)
  - [API Key UI](#api-key-ui)
- [Deep Dives](#deep-dives)
  - [File Attachments](#file-attachments)
  - [File Generation](#file-generation)
  - [HTML Structure](#html-structure)
  - [Cost Calculation Detail](#cost-calculation-detail)
  - [Security Model](#security-model)
- [Developer Guide](#developer-guide)
  - [How To: Add a Provider](#how-to-add-a-provider)
  - [How To: Add a Built-in Skill](#how-to-add-a-built-in-skill)
  - [How To: Add a Tool](#how-to-add-a-tool)
  - [Debugging](#debugging)
  - [Troubleshooting](#troubleshooting)
- [Reference](#reference)
  - [S Object Reference](#s-object-reference)
  - [Key Functions Reference](#key-functions-reference)
  - [CSS Variables](#css-variables)
  - [Data Formats](#data-formats)
  - [localStorage & IndexedDB Keys](#localstorage--indexeddb-keys)
- [Change Log](#change-log)

---

## Overview

### Introduction

Atlas is a fully client-side AI chat application. Every feature — streaming responses, file generation, multi-provider routing, artifact preview, Google Drive sync, and in-browser local models — runs entirely in the browser. There is no server component, no build pipeline, and no framework. Drop three files into any directory and open `index.html`.

> **Origin requirement:** API keys and chat history only persist across sessions when the page is served over HTTP (`http://localhost` or any hosted URL). Opening as a `file://` URL disables persistent storage. A warning banner is shown automatically when this is detected.

---

### Architecture

Atlas uses a strict three-file split with no shared build output:

| File | Role | ~Lines |
|---|---|---|
| `index.html` | All HTML structure, element IDs, inline event handlers | ~970 |
| `atlas.css` | All styles, CSS variables, animations, responsive rules | ~1,430 |
| `atlas.js` | All application logic — state, API calls, UI, storage | ~10,700 |

`atlas.js` is divided into named sections separated by `// ──` comments. The section list is documented at the top of the file. Searching for `// ── SECTION NAME` navigates directly to any subsystem.

#### External dependencies (CDN only)

| Dependency | Purpose | Loading |
|---|---|---|
| DOMPurify | Sanitises AI-generated HTML before DOM insertion | Bundled in `<head>` |
| Google Fonts | Syne (display), DM Sans (UI), DM Mono (code) | Bundled in `<head>` |
| WebLLM `@0.2.46` | WebGPU local model inference | Lazy ESM `import()` |
| Marked, Highlight.js, KaTeX | Markdown, syntax highlighting, math | Injected on first use |
| jsPDF, docx.js, pptxgenjs | File export generators | Injected on first use |

All on-demand libraries are loaded via `<script>` injection at first use and cached by the browser. They are never bundled into `atlas.js`.

---

### Quick Start

#### Run locally

```bash
# Any static server works
python3 -m http.server 8080
# Then open:
# http://localhost:8080/index.html
```

#### First-time setup

1. Open the app and click **Sign in or add API key** in the sidebar footer.
2. In Settings, choose a provider tab. OpenRouter is recommended — one key gives access to hundreds of models.
3. Paste your API key and click **Connect**.
4. Close Settings — the model dropdown in the topbar will populate.

#### Use a local model (no API key needed)

1. Open Settings → **Local Model** section.
2. Enable the *Enable local fallback* toggle.
3. Select a model and click **⬇ Download**. First download is 600 MB–1.2 GB.
4. Once downloaded, send a message — Atlas uses the local model automatically.

> **WebGPU required for local models.** Use Chrome 113+, Edge 113+, or any Chromium-based browser on a desktop with a supported GPU. The Settings panel shows a warning if WebGPU is unavailable.

---

## Core Systems

### State Object (S)

All application state lives in a single global object `S`. It is the single source of truth and is serialised to `SafeStorage` (localStorage) on every meaningful change via `persist()`.

**API keys are never stored in `S`** — they live only in `KeyStore` (Credential API or sessionStorage). `S` holds empty strings as placeholders populated at runtime by `initSecureStorage()`.

```js
const S = {
  // ── Provider & keys (runtime only — never persisted) ──────────────────
  key:          '',        // OpenRouter API key
  deepseekKey:  '',        // DeepSeek API key
  geminiKey:    '',        // Google Gemini API key
  openaiKey:    '',        // OpenAI API key
  localBaseUrl: 'http://localhost:11434',  // Local AI server URL
  localKey:     '',        // Optional bearer token for local server

  // ── Provider selection (persisted) ────────────────────────────────────
  provider:   'openrouter', // 'openrouter'|'deepseek'|'gemini'|'openai'|'local'
  model:      null,         // { id, name, context_length, pricing }
  allModels:  [],
  filtModels: [],
  favModels:  [],

  // ── Conversation state (persisted) ────────────────────────────────────
  convs:  [],     // [{ id, title, msgs, codeStore }]
  chatId: null,   // Active conversation ID
  msgs:   [],     // Messages in the active conversation
  files:  [],     // Attached files for the current message
  codeStore: new Map(),  // blockId → { lang, content }

  // ── Cost (persisted) ──────────────────────────────────────────────────
  totalCost: 0,
  budget:    0,   // Spending cap in USD (0 = no limit)

  // ── UI & config (persisted) ───────────────────────────────────────────
  cfg: {
    temp: 0.55, maxTok: 4096, topP: 0.95,
    imgSize: '1024x1024', imgModel: '',
    donts: '',
    font: 'DM Sans', fontSize: 14,
    smartPatch: true,
    globalSysPrompt: '',
    chatDensity: null,   // null = 'comfortable'
    budget: 0,
  },
  streaming:    false,
  ac:           null,    // AbortController for current stream
  sbOpen:       true,
  theme:        'dark',
  imageGenMode: false,
  webSearchMode: false,
  outputFmt:    null,    // null | 'pdf' | 'docx' | 'pptx' | 'css'
  toolDefinitions: [],

  // ── Google OAuth (partially persisted via _gPersist) ──────────────────
  google: {
    accessToken: null,
    tokenExpiry: 0,
    clientId:    '',
    user:        null,   // { name, email, picture }
    scopes:      [],
  },
};
```

---

### Storage Layer

Atlas uses three storage backends, each for a different category of data.

#### IndexedDB — `ChatStorage`

Database name: `atlas_db` v2 · Object store: `conversations` (keyPath: `id`)

Stores all conversation history. Each record has `{ id, title, msgs[], codeStore[] }`. Messages are capped at the last 40 per conversation. Key methods:

```js
ChatStorage.init()                    // Opens DB (called once on load)
ChatStorage.saveConversation(conv)    // Upsert a conversation
ChatStorage.loadAllConversations()    // Returns all records
ChatStorage.deleteConversation(id)    // Delete by ID
ChatStorage.clearAll()                // Wipe the store
ChatStorage.getStorageEstimate()      // { usage, quota } in bytes
```

#### Credential API / SessionStorage — `KeyStore`

Stores API keys using a preference-ordered fallback:

1. **Credential Management API** — browser-managed, persists across sessions, not JS-accessible after storage. Shown as 🔒 Secure.
2. **SessionStorage** — in-memory per tab, clears on close. Used on Firefox/older Safari. Shown as ⚠ Session only.

Keys are **never** written to localStorage, `S` serialisation, Drive backup, or export files.

```js
KeyStore.saveKey(provider, value)   // Returns storage source string
KeyStore.loadKey(provider)          // Returns key string or null
```

#### localStorage — `SafeStorage`

Key: `atlas_v1`

Stores non-sensitive settings only: theme, provider, model ID, `S.cfg`, sidebar state, favourites, total cost, budget. A single JSON object.

#### Google Drive — `syncChatsToDrive()`

When signed in to Google, all conversations are automatically uploaded to a private file named `atlas-chat-history.json` in the user's Drive. Uses the `drive.file` scope — Atlas can only access files it created.

#### Initialisation sequence

```
1. Open IndexedDB        → ChatStorage.init()
2. Load conversations    → populate S.convs
3. Load settings         → SafeStorage → S.cfg, S.provider, S.theme…
4. Load API keys         → KeyStore.loadKey() × 4 providers
5. Restore Google token  → _gPersist() stored token if still valid
6. Update UI             → renderChatList(), updateKeyUI(), updateSecurityStatus()
7. Load models           → if any key present → reloadModels()
8. Update sidebar footer → _updateSidebarFooter()
```

---

### API Providers

| Provider | `S.provider` | Key field | API base URL | Model list |
|---|---|---|---|---|
| OpenRouter | `'openrouter'` | `S.key` | `openrouter.ai/api/v1` | `/models` (live) |
| DeepSeek | `'deepseek'` | `S.deepseekKey` | `api.deepseek.com/v1` | Fallback list only |
| Gemini | `'gemini'` | `S.geminiKey` | `generativelanguage.googleapis.com` | `/v1beta/models` (live) |
| OpenAI | `'openai'` | `S.openaiKey` | `api.openai.com/v1` | `/models` (live) |
| Local | `'local'` | `S.localKey` (opt.) | `S.localBaseUrl` | `/v1/models` (live) |

#### Active key resolution

```js
const activeKey =
  S.provider === 'deepseek' ? S.deepseekKey :
  S.provider === 'gemini'   ? S.geminiKey   :
  S.provider === 'openai'   ? S.openaiKey   :
  S.provider === 'local'    ? (S.localKey || 'local') :
  S.key; // openrouter
```

If `activeKey` is falsy and no local model fallback is available, `openKeyModal()` is called — which opens the Settings panel and scrolls to the API Keys section.

#### Local provider (Ollama / LM Studio)

Sends OpenAI-compatible requests to `S.localBaseUrl + '/v1/chat/completions'`. Any server implementing the OpenAI chat completions API works. The API key is optional — sent as a Bearer token if provided.

**Preset base URLs:**

| Server | URL |
|---|---|
| Ollama | `http://localhost:11434` |
| LM Studio | `http://localhost:1234` |
| llama.cpp | `http://localhost:8080` |

> **CORS:** Ollama blocks cross-origin requests by default. Start it with `OLLAMA_ORIGINS=* ollama serve`.

---

### Messaging Pipeline

`sendMessage()` is the central dispatch function, running these stages in order:

```
1. Read input          → trim text, check empty
2. Resolve active key  → key found → continue
                         no key → local fallback check → openKeyModal
3. Clarifying question?→ first message + pattern match → showClarify() and pause
4. Image gen mode?     → yes → sendImageGenRequest()
5. Patch edit intent?  → yes + codeStore non-empty → inject current code block
6. Output format?      → pdf/docx/pptx → inject format system prompt
7. Active skill?       → yes → prepend skill system prompt
8. Build message array → buildApiMsgs() — history cap, sys prompt, file attachments
9. Call API            → callApi() → streams tokens into chat bubble
10. Post-process       → parse code blocks → codeStore, render artifacts,
                         update cost, persist(), Drive sync (debounced)
```

#### `buildApiMsgs()`

Assembles the message array sent to the API. Scans from the most recent message backwards, accumulating token estimates until the context budget is reached. Inserts the system prompt as the first element. Converts `S.files` entries into multi-part content objects.

#### Message object shape

```js
{
  role:        'user' | 'assistant',
  content:     string | array,   // array for multi-part (text + image/file)
  iTok:        number,           // input tokens (from API response)
  oTok:        number,           // output tokens
  cost:        number,           // USD cost of this message
  files:       [{ name, type }], // metadata only (data stripped on save)
  imageResult: { prompt, images: [{ url }] } | null,
  toolCalls:   [{ id, function: { name, arguments } }] | null,
  toolResults: array | null,
}
```

---

### Streaming

All cloud providers use Server-Sent Events (SSE) streaming. `callApi()` creates a `fetch` request with `stream: true`, reads the `ReadableStream` chunk by chunk, and fires a token callback for each decoded piece.

#### Provider-specific formats

- **OpenRouter / DeepSeek / OpenAI / Local** — Standard OpenAI SSE:
  `data: {"choices":[{"delta":{"content":"..."}}]}`
- **Gemini** — Uses `streamGenerateContent` with `alt=sse`. Handled separately in the `// ── GEMINI API ──` section.

#### Abort

The ⏹ stop button triggers `S.ac.abort()` where `S.ac` is the active `AbortController`. The partial response is retained in chat and persisted.

#### Continuation

When a response is cut off at `max_tokens`, a **Continue →** button appears. Clicking it calls `_doContinue()`, which resends the conversation including the partial response and appends the continuation to the existing bubble.

---

## Features

### Skills System

Skills are reusable system prompt fragments that specialise the model for a task category. They are injected as the system prompt when a message is sent.

#### Built-in skills

| Icon | Name | Focus |
|---|---|---|
| 🎨 | Frontend Design | Aesthetic direction, distinctive fonts, complete working code without preamble |
| 📄 | Document Writing | Plain language, active voice, no filler phrases, structure matched to formality |
| 💻 | Code Assistant | Correctness-first, idiomatic code, root-cause debugging, explicit trade-offs |
| 🧠 | Deep Analysis | Steel-man arguments, facts vs inferences, load-bearing assumptions |
| 🎮 | Game Development | Three.js/Canvas, game loop, physics, mobile input |
| 📊 | Data Analysis | Structured output, chart recommendations, statistical rigour |

#### Custom skills

Users create custom skills in Settings → Skills. Each skill has `{ id, icon, name, desc, prompt }`. Custom skills are stored in `S.cfg.customSkills` and persist across sessions.

#### Auto-detect

Atlas scans user input for intent keywords and suggests a matching skill via the **detected intent pill** below the input. The mapping is defined in `INTENT_MAP`. Auto-detect only fires on the first message of a conversation and only if no skill is already active.

#### Skill injection

When a skill is active, `sendMessage()` prepends the skill's `prompt` to the system prompt before building the API message array. The skill name is shown in the **active skill pill** next to the input.

---

### Patch Edit System

The patch edit system produces minimal targeted diffs rather than full rewrites when the user makes follow-up edit requests like "make the button blue" or "fix the loop on line 12".

#### How it works

1. Every code block rendered in chat is assigned a unique `blockId` and stored in `S.codeStore` as `{ lang, content }`.
2. `isEditIntent(text)` fires on every outgoing message. Returns `true` if the text contains an **edit verb** (`fix`, `change`, `update`, `replace`…) **AND** a **code-context keyword** (`color`, `function`, `class`, `button`…) **AND** `S.codeStore` is non-empty.
3. When edit intent is detected, `buildCodeStoreInjection()` selects the most relevant block (explicit block ID mention wins; otherwise the most recently rendered block) and injects the full code as a numbered line listing into the system context.
4. A strict instruction tells the model to respond with a patch in `patch` format — never a full rewrite.

#### Large file handling

For code over ~16,000 characters (~4,000 tokens), the full file is not injected. A relevance scoring pass identifies the lines most likely referenced by the edit request. Up to 3 non-overlapping windows of ~60 lines each are selected, with ellipsis markers where lines are omitted.

#### Patch format

````
```patch
<<<< FIND
const color = 'red';
====
const color = 'blue';
>>>> REPLACE
```
````

The patch engine parses these blocks and applies them to the stored code in `S.codeStore`. The updated artifact re-renders in the artifact panel.

> Smart Patch can be disabled in Settings if full rewrites are preferred. Some models don't reliably follow the patch format.

---

### Artifact Panel

When a code block is detected in an AI response, `previewCode(id)` is called and the artifact panel slides in from the right, showing a live rendered preview in an `<iframe>`.

#### Internal state

```js
const _artifacts = [];   // [{ id, lang, code, title, driveLink? }]
let _activeArt = 0;      // index into _artifacts
```

#### View modes

| Mode | Description |
|---|---|
| Preview | Rendered in a sandboxed `<iframe>` with `srcdoc` |
| Source | Syntax-highlighted raw code view |
| Visual Editor | Active for DOCX and PPTX artifacts |

#### Visual editors

- **DOCX editor** — Renders as editable paragraphs, headings, and bullet lists. Serialises back to JSON on export.
- **PPTX editor** — Renders slides with title/body/bullets, supports slide navigation, background colour picker, font size controls, and an undo stack.

#### Drive upload

The ☁ button uploads the current artifact to Google Drive with the appropriate MIME type. Requires Google sign-in. After upload, a *View in Drive →* link appears in the artifact header.

#### Resize

The panel is resizable by dragging its left edge handle. Width is constrained between 300 px and 92 vw. The chat area margin adjusts live during drag.

---

### Output Formats

The output format bar (📎 icon in the input row) lets users request structured data output for direct file download.

| Format | Code fence tag | JSON schema summary | Exported as |
|---|---|---|---|
| PDF | `pdf-content` | `{title, author?, sections:[{heading,body,bullet_points?}], footer?}` | `.pdf` via jsPDF |
| Word | `docx-content` | `{title, sections:[{heading?,body,bullet_points?}]}` | `.docx` via docx.js |
| PowerPoint | `pptx-content` | `{title, slides:[{title,body?,bullets?,notes?}]}` | `.pptx` via pptxgenjs |
| CSS | `css` | Raw CSS text | `.css` plain download |

When an output format is active, `sendMessage()` prepends the format's `systemPrompt` to the API call, instructing the model to respond exclusively with the fenced block. The renderer shows a download button instead of a code preview.

---

### Image Generation

Toggled via the 🎨 icon. Messages are sent to the selected image generation model via OpenRouter's image endpoint rather than the chat completions endpoint.

#### Supported models

```
openai/dall-e-3, openai/dall-e-2
stability/stable-diffusion-xl, .../3, .../3.5-large
black-forest-labs/flux-1.1-pro, .../schnell, .../dev, .../pro
recraft-ai/recraft-v3
ideogram-ai/ideogram-v2
```

The image model and size are configured independently in Settings. Generated images are stored in `m.imageResult: { prompt, images: [{ url }] }` and rendered with a download button.

---

### Tool Use

Tool definitions are registered in `initToolDefinitions()` and sent to the API in the `tools` field. When the model returns a tool call, the tool execution handler in `sendMessage()` dispatches to the appropriate function and returns a tool result message.

Tool calls are rendered in chat as collapsible blocks showing function name, arguments, and result. A confirmation modal appears before executing destructive tools.

> Gmail and Google Calendar tool connectors have been removed from the current build. `_executeGoogleTool()` returns `null`. Google sign-in is retained for chat history sync only.

---

### Cost Tracker

Every API response includes token counts. The cost tracker multiplies these by the model's per-token pricing and maintains a running total in `S.totalCost`.

**Formula:** `cost = iTok × model.pricing.prompt + oTok × model.pricing.completion`

Pricing values are stored as USD per token (not per million). OpenRouter's `/models` endpoint returns them in this format.

**Free providers:**
- **Gemini (AI Studio key):** Shows "Free\*" unless `S.cfg.geminiTrackCost` is true.
- **Local provider:** Always shows "Local".
- **Local model (WebGPU):** No cost tracked.

**Budget enforcement:** If `S.budget > 0` and `S.totalCost >= S.budget`, sending is blocked until the budget is reset. The budget bar fills proportionally and changes colour: green → amber (60%) → red (90%).

---

### Clarifying Questions

On the first message of a new conversation, Atlas scans for patterns suggesting an ambiguous request and surfaces a quick clarification bar before sending.

#### Trigger conditions

- Message is 15–25 words
- Message matches a pattern in `CLARIFY_TRIGGERS`
- No prior messages exist in the conversation

#### Built-in triggers

| Pattern | Question |
|---|---|
| Build an app / website / game | What platform/stack? |
| Write an email / message / letter | What tone? |
| Explain / what is / how does | How much depth? |
| Design a logo / icon / image | Style preference? |
| Analyze / review / evaluate | What focus? |
| Translate | Which language? |
| Summarize / TL;DR | Summary length? |
| Story / fiction / creative | Tone? |

#### Resolution

When the user selects an option, the answer is appended to the original message in brackets — e.g. *"Build me a login form [What platform/stack?: React]"* — and `sendMessage()` fires with the enriched text.

---

## Integrations

### Google Sign-In

Google OAuth is used exclusively for chat history sync to Drive. The flow uses the implicit grant (token endpoint), keeping everything client-side.

#### Scope

```
https://www.googleapis.com/auth/drive.file  // only files created by this app
email
profile
```

The `drive.file` scope means Atlas can only read and write files it created — it cannot access any other Drive content.

#### Token storage

The access token and expiry are stored in `S.google.accessToken` and `S.google.tokenExpiry` via `_gPersist()`, which writes to `SafeStorage` under `atlas_google_v1`. On page load, `initSecureStorage()` restores the token if still valid. Validation includes a 30-second grace period: `Date.now() < tokenExpiry - 30000`.

#### Sidebar footer behaviour

When signed in → shows Google account card with avatar, name, and "Chats saved to Drive".  
When signed out → shows API key status dot and "Sign in or add API key".

---

### Drive Chat History Sync

Chat history is synced to a single file `atlas-chat-history.json` in the user's Google Drive.

#### Sync triggers

| Trigger | Function | Notes |
|---|---|---|
| Automatic | `_scheduleSync()` | Debounced 3 s after every `persist()` call |
| Manual | `gDriveSyncNow()` | "☁ Sync now" button in Settings |
| On sign-in | `_restoreChatsFromDrive()` | Downloads and merges with local chats |

#### Drive file format

```json
{
  "version": 2,
  "exportedAt": "2025-05-10T12:00:00.000Z",
  "convs": [ /* array of conversation records */ ]
}
```

#### Merge strategy on restore

Both local and Drive conversation sets are loaded and merged by ID. Drive wins on ID conflict. New Drive conversations that don't exist locally are added. The merged set is saved to IndexedDB and the sidebar re-renders.

---

### Local Model (WebGPU)

`LocalModelManager` manages downloading, caching, and running small open-source LLMs entirely in the browser using [WebLLM](https://github.com/mlc-ai/web-llm) and the WebGPU API.

#### Supported models

| Model ID | Label | Size | Notes |
|---|---|---|---|
| `TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC` | TinyLlama 1.1B | 638 MB | Fastest |
| `SmolLM2-1.7B-Instruct-q4f16_1-MLC` | SmolLM2 1.7B | 980 MB | Good balance |
| `gemma-2-2b-it-q4f16_1-MLC` | Gemma 2B | 1.2 GB | Best quality |

#### WebLLM loading

WebLLM is an ESM-only package. It is loaded via a dynamic `import()` in a `<script type="module">` tag in `index.html`:

```html
<script type="module">
  try {
    const wl = await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.46/lib/index.js');
    window.webllm = wl;
    window.dispatchEvent(new CustomEvent('webllm-ready', { detail: wl }));
  } catch (e) {
    window.dispatchEvent(new CustomEvent('webllm-ready', { detail: null }));
  }
</script>
```

The `webllm-ready` event lets the rest of the app react without polling. `_waitForWebLLM()` returns a Promise that resolves immediately if already loaded, or waits for the event with a 30-second timeout.

#### Download flow

```
1. _waitForWebLLM()                    → waits for webllm-ready event
2. new webllm.MLCEngine()
3. engine.setInitProgressCallback(cb)  ← MUST be called before reload()
4. engine.reload(modelId)              → downloads weights to browser cache
5. _parseProgress(report)             → extracts progress from report text
6. Mark downloaded                     → localStorage atlas-local-model-downloaded
```

> **Critical:** In WebLLM 0.2.x, the `initProgressCallback` **must** be registered on the engine instance via `engine.setInitProgressCallback()` before calling `engine.reload()`. Passing it inside the config object to `reload()` is silently ignored.

#### Progress parsing

WebLLM reports progress in two phases with different data shapes:

| Phase | `report.progress` | `report.text` |
|---|---|---|
| Download | `0` | `"Fetching param cache[23/158]: 14.56 MB fetched"` |
| Model init | `0.0` → `1.0` | Human-readable label |

`_parseProgress(report)` handles both:

```js
function _parseProgress(report) {
  // Init phase: direct 0-1 float
  if (report.progress && report.progress > 0)
    return { pct: Math.min(99, Math.round(report.progress * 100)), label: report.text };

  // Download phase: extract [N/M] fraction from text
  const fracMatch = report.text?.match(/\[(\d+)\/(\d+)\]/);
  if (fracMatch) {
    const pct = Math.min(99, Math.round(parseInt(fracMatch[1]) / parseInt(fracMatch[2]) * 100));
    return { pct, label: report.text };
  }

  // Fallback: percentage pattern in text
  const pctMatch = report.text?.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch)
    return { pct: Math.min(99, Math.round(parseFloat(pctMatch[1]))), label: report.text };

  return { pct: 0, label: report.text || 'Starting…' };
}
```

#### Inference flow

```js
generateResponse(messages, onToken)
  → _waitForWebLLM()
  → engine.setInitProgressCallback(cb)   // if engine needs (re)loading
  → engine.reload(modelId)
  → engine.chat.completions.create({ stream: true })
  → for await (chunk of stream) → onToken(delta)
```

#### Fallback routing in `sendMessage()`

```
activeKey resolved?
  ├─ yes → normal cloud path
  └─ no key
      ├─ fallbackEnabledButNotDownloaded() → toast + openSettings()
      └─ shouldUseFallback()?
          ├─ yes → _sendWithLocalModel(text)
          └─ no  → openKeyModal()
```

#### `shouldUseFallback()` conditions

Returns `true` only if ALL of:
- `atlas-fallback-enabled === "true"`
- No cloud API key is set (`S.key || S.deepseekKey || S.geminiKey || S.openaiKey` all falsy)
- The selected model ID is in `atlas-local-model-downloaded`

#### localStorage keys

| Key | Value |
|---|---|
| `atlas-local-model` | Selected model ID string |
| `atlas-fallback-enabled` | `"true"` or `"false"` |
| `atlas-local-model-downloaded` | JSON array of downloaded model IDs |

#### `LocalModelManager` public API

```js
LocalModelManager.checkWebGPUSupport()            // → boolean
LocalModelManager.isModelDownloaded(modelId)      // → boolean
LocalModelManager.getCachedModels()               // → string[]
LocalModelManager.setFallbackEnabled(bool)        // persists to localStorage
LocalModelManager.setSelectedModel(modelId)       // persists to localStorage
LocalModelManager.estimateModelSize(modelId)      // → "638 MB" etc.
LocalModelManager.downloadSelected()              // → Promise, shows progress UI
LocalModelManager.deleteSelected()                // → Promise, removes from list
LocalModelManager.generateResponse(msgs, onToken) // → Promise<string>
LocalModelManager.shouldUseFallback()             // → boolean
LocalModelManager.fallbackEnabledButNotDownloaded()// → boolean
LocalModelManager.initSettingsUI()                // sync Settings panel UI
LocalModelManager.showLocalModelIndicator(bool)   // topbar "🖥️ Local model" pill
```

---

### Web Search

Toggled via the 🔍 icon. When active, Atlas sends the `web_search` plugin parameter to OpenRouter, enabling models to search the web during generation. Only available with the OpenRouter provider — the toggle is hidden for others.

---

## UI Systems

### Settings Panel

Opened by `openSettings()`, saved by `saveSettings()`. On open, three init functions run:

```js
LocalModelManager.initSettingsUI();
aksInit();
_gUpdateUI();
```

#### Sections

| Section | Contents |
|---|---|
| Model parameters | Temperature, max tokens, top-p |
| Google Account | Sign in/out, manual sync, last sync timestamp |
| API Keys | Tabbed inline key entry for all 5 providers |
| System Prompt | Global default + 4 presets (Smart, Concise, Technical, Clear) |
| Output & Style | Font family, font size, chat density, image model/size |
| Budget | Spending cap in USD |
| Storage | Usage stats, export/import JSON, clear all data, key persistence toggle |
| Skills | Manage built-in and custom skills |
| Local Model | Enable fallback, model selector, download with progress bar |

#### System prompt presets

| Preset | Key behaviour |
|---|---|
| Smart | No filler phrases, prose not lists, length matched to complexity |
| Concise | One sentence if it suffices, no preamble, no sign-off |
| Technical | Skip the basics, precise terminology, deeper explanations |
| Clear | Plain language, short sentences, one idea per paragraph |

---

### Sidebar & Conversations

The sidebar lists all conversations from `S.convs`. On mobile it's a drawer toggled by ☰; on desktop it's always visible and collapsible.

#### Conversation lifecycle

| Action | Function | Effect |
|---|---|---|
| New chat | `newChat()` | Creates UUID, adds to `S.convs`, saves to IndexedDB, resets view |
| Switch | `loadConv(id)` | Loads from `S.convs`, restores `S.msgs` and `S.codeStore`, re-renders |
| Auto-title | (after first response) | First 50 chars of user's first message become the title |
| Delete | `deleteConv(id)` | Removes from `S.convs`, deletes from IndexedDB, re-renders sidebar |

#### Search

`filterConvs(query)` filters the sidebar list in real-time by conversation title. Case-insensitive substring match.

#### Right message nav

A fixed-position panel on the right edge of the chat (DeepSeek-style) lists all messages in the current conversation. Shows role label and a 60-character snippet. Clicking a message scrolls to it.

---

### Markdown Renderer

`parseMarkdown(text)` converts AI responses to HTML. It is a custom renderer (not a library) built for performance and Atlas-specific behaviour.

#### Supported syntax

| Feature | Notes |
|---|---|
| Fenced code blocks | Language tag; registered in `S.codeStore`; Copy + Preview buttons |
| Inline code | Backtick spans |
| Bold, italic, strikethrough | Standard markers |
| Headers h1–h6 | |
| Unordered and ordered lists | Including nested |
| Tables | GFM-style pipe tables |
| Blockquotes | |
| Horizontal rules | |
| Links | Opened in new tab with `rel="noopener"` |
| KaTeX math | `$inline$` and `$$block$$`, loaded on demand |
| Syntax highlighting | Highlight.js, loaded on demand |

All output is passed through DOMPurify before DOM insertion.

---

### Themes & Fonts

#### Themes

Two themes: `dark` (default) and `light`. Toggled by `setTheme(t)`. The `data-theme` attribute on `<body>` switches the full CSS variable set.

#### Fonts

| Option | Stack |
|---|---|
| DM Sans (default) | `'DM Sans', sans-serif` |
| Inter | `'Inter', sans-serif` |
| Merriweather | `'Merriweather', serif` |
| JetBrains Mono | `'JetBrains Mono', monospace` |
| System | `system-ui, sans-serif` |

Applied via `applyFont(family, size)`. Font size range: 12–20 px.

#### Chat density

Three modes applied as a CSS class on `#chat-area`:

| Mode | Class | Effect |
|---|---|---|
| Comfortable (default) | `density-comfortable` | Standard padding/line-height |
| Compact | `density-compact` | Reduced padding and tighter spacing |
| Spacious | `density-spacious` | Increased padding and larger bubbles |

---

### API Key UI

The popup-based key entry modal has been replaced by an inline tabbed section in Settings.

| Function | Description |
|---|---|
| `aksSwitch(prov, btn)` | Switches active provider tab, loads masked existing key |
| `aksSaveKey()` | Saves key to KeyStore + S, switches `S.provider`, reloads models |
| `aksClearKey()` | Removes key for active provider from storage |
| `aksInit()` | Called on Settings open — syncs tab states to current key presence |
| `_updateSidebarFooter()` | Syncs sidebar footer between Google card and key status dot |
| `_akdClick()` | Sidebar footer click → opens Settings, scrolls to right section |
| `openKeyModal()` | Kept as redirect — opens Settings + scrolls to API Keys section |

---

## Deep Dives

### File Attachments

Users can attach files to any message. Files are read into memory via `FileReader` and sent as multi-part content to the API.

#### Supported file types

| Type | Sent as | Icon | Notes |
|---|---|---|---|
| Images (jpg, png, gif, webp) | base64 data URL | 🖼️ | Sent as `image_url` content part for vision models |
| PDF | base64 data URL | 📄 | Sent as `document` content part where supported |
| CSV | plain text | 📊 | Included as text block |
| JSON | plain text | 📋 | Included as text block |
| Text (.txt, .md, .js, etc.) | plain text | 📝 | Included as text block |

#### Attachment lifecycle

1. User clicks 📎, drags a file onto the input area, or pastes an image from the clipboard.
2. `attachFiles(fileList)` reads each file with `readFile()` and pushes to `S.files`.
3. Chips appear in `#attached-files` showing filename, icon, and size.
4. On send, `buildApiMsgs()` converts `S.files` entries into the correct content part format for the active provider.
5. `S.files` is cleared after the message is sent.

#### Storage note

File contents in messages are stored as base64 strings in IndexedDB. The save function strips image data from persisted messages to keep storage manageable, retaining only `{ name, type }` metadata.

---

### File Generation

When the AI returns a fenced block with a format tag, the renderer shows a download button. Clicking it calls the appropriate generator function.

#### Lazy loading

All generator libraries are loaded on first use via `loadScript(src)`, which injects a `<script>` tag and returns a Promise. The browser caches them on subsequent calls.

| Format | Generator function | Library | Source |
|---|---|---|---|
| PDF | `generatePDF(jsonStr, filename)` | jsPDF 2.5.1 | cdnjs.cloudflare.com |
| DOCX | `generateDOCX(jsonStr, filename)` | docx.js | cdnjs.cloudflare.com |
| PPTX | `generatePPTX(jsonStr, filename)` | pptxgenjs | cdnjs.cloudflare.com |
| CSS | `generateCSS(cssStr, filename)` | None | Blob download |

#### `parseModelJSON(raw)`

Defensively extracts JSON from the model's raw output. Strips markdown fences the model may have added inside the block, then finds the first `{` and last `}` to extract the JSON regardless of surrounding prose.

#### PDF generation

Uses jsPDF in millimetre mode. Page setup (size A4/Letter/Legal/A3/A5, orientation, margins) can come from `_vePageSetup` from the visual editor. Renders: title, optional author, decorative rule, section headings, body paragraphs, bullet lists. `checkPage(need)` adds a new page when less than `need` mm remain.

#### PPTX generation

Each slide in the JSON array becomes a pptxgenjs slide with title, optional body, optional bullets, and optional speaker notes. A consistent theme is applied from the visual editor's current state.

#### DOCX generation

Section headings → `Heading1` paragraphs. Body text → normal paragraphs. Bullet lists → list items. Output is a valid `.docx` Blob downloaded via an object URL.

---

### HTML Structure

All element IDs and their roles. `atlas.js` never creates new top-level DOM elements — it only populates these.

```
#app
├── #origin-banner              file:// protocol warning
├── #sov                        sidebar overlay (mobile tap-to-close)
├── #sidebar
│   ├── .sb-hd                  sidebar header (logo, new chat button)
│   ├── #conv-search-wrap       conversation search input
│   ├── #chatlist               rendered conversation list
│   └── .sb-ft                  sidebar footer
│       ├── #sb-google-signed-in  Google account card (hidden when signed out)
│       └── #akd-area           API key status dot + text
├── #main
│   ├── #topbar
│   │   ├── #msw                model selector widget
│   │   │   ├── #msbtn          model selector button
│   │   │   └── #mdd            model dropdown panel
│   │   ├── #cost-tracker       session cost display
│   │   ├── #sec-status-btn     storage security indicator
│   │   └── #local-model-indicator  "🖥️ Local model" pill
│   ├── #ctx-bar                context window fill bar
│   ├── #chat-area              message bubbles
│   │   └── #welcome-static     empty state placeholder
│   └── #input-zone
│       ├── #sys-bar            system prompt toggle + textarea
│       ├── #attached-files     file attachment chips
│       ├── #fmt-bar            output format selector chips
│       ├── #clarify-bar        clarifying question chips
│       ├── #active-skill-pill  active skill indicator
│       ├── #detected-intent-pill  auto-detected intent suggestion
│       └── #input-box          textarea + action buttons
├── #artifact-panel             right-side artifact viewer
│   ├── #artifact-hdr           title, tabs, action buttons
│   ├── #artifact-tabs          tab strip
│   └── #artifact-body          iframe or source view
├── #settings-modal             settings overlay
├── #msg-nav-panel              right message navigation panel
└── [modal overlays]            skill editor, tool confirm, debug panel
```

Message bubbles are created by `appendMsgEl(m)` and assigned IDs like `bubble-0`, `bubble-1`, etc.

---

### Cost Calculation Detail

**Formula:** `cost = iTok × model.pricing.prompt + oTok × model.pricing.completion`

All pricing values are in USD per token (not per million).

#### Free providers

| Provider | Display | Condition |
|---|---|---|
| Gemini (AI Studio) | "Free\*" | `S.provider === 'gemini' && !S.cfg.geminiTrackCost` |
| Local server | "Local" | `S.provider === 'local'` |
| Local model (WebGPU) | No cost shown | `_sendWithLocalModel()` path |

#### Pre-send estimate

`updateEst()` fires on every keystroke. Token estimate: `Math.ceil(text.length / 4)` (4 chars ≈ 1 token). Shows estimated input cost below the input box.

#### Budget enforcement

```
S.budget > 0 && S.totalCost >= S.budget
  → block send, show warning toast
  → budget bar: green → amber (60%) → red (90%)
```

---

### Security Model

#### API key storage tiers

| Tier | Storage | Persistence | Indicator |
|---|---|---|---|
| 1 | Credential Management API | Cross-session, browser-managed | 🔒 Secure |
| 2 | sessionStorage | Tab lifetime only | ⚠ Session only |
| 3 | None | Must re-enter each visit | ✕ Not stored |

Keys are **never** stored in: localStorage, `S` serialisation, Drive backup, or export files.

#### Content sanitisation

All AI-generated HTML is passed through DOMPurify before `innerHTML` insertion. This prevents XSS from malicious model outputs.

#### Artifact sandbox

Artifacts render in `<iframe>` elements with a `sandbox` attribute. Scripts inside the artifact cannot access the parent page's DOM or `window`.

#### Google scope minimisation

Only `drive.file` is requested. Atlas cannot read any existing Drive files — only the single `atlas-chat-history.json` file it creates.

#### No telemetry

Atlas makes no analytics calls, no error reporting calls, and no calls to any Atlas-controlled server. All network traffic goes exclusively to the AI provider you configure and to Google's APIs if signed in.

---

## Developer Guide

### How To: Add a Provider

1. **Add a key field to S:**
   ```js
   S.mistralKey = '';
   ```

2. **Update the active key resolver** in `sendMessage()`:
   ```js
   const activeKey =
     S.provider === 'mistral' ? S.mistralKey :
     // ... existing providers
   ```

3. **Add a model list fetcher** in `reloadModels()` — handle the `'mistral'` case, fetch from the provider's models endpoint, normalise to `{ id, name, context_length, pricing }`.

4. **Add streaming handler** in `callApi()` — if the provider uses OpenAI-compatible SSE, only the base URL and auth header need changing. Otherwise add a parallel function like `callGemini()`.

5. **Add key UI** — add a tab button in the API Keys section of `index.html` and handle it in `aksSwitch()`:
   ```js
   case 'mistral':
     keyInput.value = S.mistralKey ? '••••' + S.mistralKey.slice(-4) : '';
     break;
   ```

6. **Add to KeyStore** — call `KeyStore.saveKey('mistral', val)` in `aksSaveKey()` and `KeyStore.loadKey('mistral')` in `initSecureStorage()`.

---

### How To: Add a Built-in Skill

Add an entry to `BUILTIN_SKILLS` near the top of `atlas.js`:

```js
BUILTIN_SKILLS.push({
  id:     'legal',
  icon:   '⚖️',
  name:   'Legal Writing',
  desc:   'Precise, citation-ready legal documents and analysis',
  prompt: `Your system prompt here. Be specific about tone,
structure, and what the model should avoid or prioritise.`
});
```

To add the skill to the intent auto-detector, add to `INTENT_MAP`:

```js
INTENT_MAP['legal'] = [
  'contract', 'lawsuit', 'clause', 'legal', 'liability', 'statute'
];
```

Keywords are matched case-insensitively against user input. First match wins.

---

### How To: Add a Tool

**1. Define the schema** in `initToolDefinitions()`:

```js
S.toolDefinitions.push({
  type: 'function',
  function: {
    name:        'get_weather',
    description: 'Get current weather for a city',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' }
      },
      required: ['city']
    }
  }
});
```

**2. Handle execution** in the tool call handler inside `sendMessage()`:

```js
if (name === 'get_weather') {
  const data = await fetch(`https://wttr.in/${args.city}?format=j1`);
  result = { weather: (await data.json()).current_condition[0] };
}
```

> Tool schemas are sent with every API request when `S.toolDefinitions` is non-empty. Keep schemas small — each tool adds to the system prompt token count and therefore to cost.

---

### Debugging

#### Debug panel

Access via `?debug=1` URL parameter or `openDebug()` from the console. Shows:

- Raw API request payload for the last message
- Raw API response JSON
- IndexedDB storage stats
- `S` object snapshot (keys redacted)

#### Browser console shortcuts

```js
// Inspect current state (keys redacted)
JSON.stringify({...S, key:'[R]', deepseekKey:'[R]', geminiKey:'[R]', openaiKey:'[R]'}, null, 2)

// List all conversations
S.convs.map(c => c.title)

// Inspect codeStore
[...S.codeStore.entries()]

// Check WebLLM load status
!!window.webllm

// Check Google session
S.google.user?.email

// Manually trigger Drive sync
gDriveSyncNow()

// Force re-render of chat
renderMessages()

// Check what's in IndexedDB
ChatStorage.loadAllConversations().then(console.log)
```

#### Network inspection

All API calls use `fetch()` and are visible in DevTools → Network → Fetch/XHR. The request body contains the full message array and model ID; the response body streams in for SSE calls.

#### Storage inspection

DevTools → Application → IndexedDB → `atlas_db` → `conversations` — all stored conversations.  
DevTools → Application → Local Storage → `atlas_v1` — settings JSON.

---

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Models don't load | API key not set or invalid | Settings → API Keys, re-enter key, click Connect |
| Chats lost after reload | Page opened as `file://` | Serve via HTTP: `python3 -m http.server 8080` |
| API key doesn't persist | Credential API unavailable (Firefox) | Key is in sessionStorage — re-enter each session, or use Chrome |
| Local model stuck at 0% | WebLLM module not loaded yet | Wait for Download button to become enabled; it polls until ready |
| Download button disabled | WebGPU not available | Use Chrome 113+ or Edge 113+ on desktop |
| Streaming stops mid-response | Network timeout or provider error | Click Continue → to resume; check DevTools for error code |
| Patch edit produces full rewrite | Model ignoring patch instruction | Disable Smart Patch in Settings |
| Drive sync fails | Expired Google token | Sign out and sign back in via Settings → Google Account |
| Artifact panel blank | iframe sandbox blocking scripts | View Source tab in artifact panel for syntax errors |
| Cost shows $0.0000 | Model has no pricing data in API response | Informational only — no fix needed |
| Local Ollama can't connect | CORS blocked | Start with `OLLAMA_ORIGINS=* ollama serve` |
| Gemini rate limit errors | Too many tokens per request | Reduce max tokens in Settings, or switch to a Flash model |

---

## Reference

### S Object Reference

All fields on the global `S` object. Fields marked 🔒 are never written to localStorage.

| Field | Type | Default | Description |
|---|---|---|---|
| `key` 🔒 | string | `''` | OpenRouter API key (in-memory only) |
| `deepseekKey` 🔒 | string | `''` | DeepSeek key |
| `geminiKey` 🔒 | string | `''` | Gemini key |
| `openaiKey` 🔒 | string | `''` | OpenAI key |
| `localBaseUrl` | string | `'http://localhost:11434'` | Local AI server URL |
| `localKey` 🔒 | string | `''` | Optional bearer token for local server |
| `provider` | string | `'openrouter'` | Active provider ID |
| `model` | object\|null | `null` | Selected model `{id, name, context_length, pricing}` |
| `allModels` | array | `[]` | All fetched models |
| `filtModels` | array | `[]` | Currently filtered models |
| `favModels` | array | `[]` | Pinned model IDs |
| `convs` | array | `[]` | All conversations |
| `chatId` | string\|null | `null` | Active conversation ID |
| `msgs` | array | `[]` | Messages in active conversation |
| `files` | array | `[]` | Attached files for next message |
| `totalCost` | number | `0` | Cumulative session cost USD |
| `budget` | number | `0` | Spending cap (0 = none) |
| `cfg.temp` | number | `0.55` | Temperature |
| `cfg.maxTok` | number | `4096` | Max tokens per response |
| `cfg.topP` | number | `0.95` | Top-p sampling |
| `cfg.imgSize` | string | `'1024x1024'` | Image generation size |
| `cfg.imgModel` | string | `''` | Image generation model |
| `cfg.donts` | string | `''` | Custom negative instructions |
| `cfg.font` | string | `'DM Sans'` | UI font family |
| `cfg.fontSize` | number | `14` | UI font size in px |
| `cfg.smartPatch` | boolean | `true` | Patch edit system enabled |
| `cfg.globalSysPrompt` | string | `''` | Global default system prompt |
| `cfg.chatDensity` | string\|null | `null` | `null`\|`'compact'`\|`'spacious'` |
| `streaming` | boolean | `false` | True while streaming |
| `ac` | AbortController\|null | `null` | Current stream abort controller |
| `sbOpen` | boolean | `true` | Sidebar visible |
| `theme` | string | `'dark'` | `'dark'` or `'light'` |
| `imageGenMode` | boolean | `false` | Image generation active |
| `webSearchMode` | boolean | `false` | Web search plugin active |
| `outputFmt` | string\|null | `null` | `null`\|`'pdf'`\|`'docx'`\|`'pptx'`\|`'css'` |
| `codeStore` | Map | `new Map()` | `blockId → {lang, content}` |
| `toolDefinitions` | array | `[]` | Tool schemas for API |
| `google.accessToken` 🔒 | string\|null | `null` | OAuth access token |
| `google.tokenExpiry` | number | `0` | Token expiry timestamp (ms) |
| `google.user` | object\|null | `null` | `{name, email, picture}` |

---

### Key Functions Reference

| Function | Section | Description |
|---|---|---|
| `initSecureStorage()` | PERSISTENCE | Master init: opens IDB, loads convs, keys, settings, Google token |
| `persist()` | PERSISTENCE | Serialises S to SafeStorage; schedules Drive sync |
| `sendMessage()` | SEND MESSAGE | Main dispatch: validates, enriches, calls API |
| `callApi(msgs, onTok)` | API CALLS | Streaming API call for all non-Gemini providers |
| `buildApiMsgs()` | MESSAGE BUILDING | Assembles history-capped message array with sys prompt |
| `previewCode(id)` | ARTIFACT PANEL | Opens/updates artifact panel for a code block |
| `parseMarkdown(text)` | MARKDOWN | Custom markdown → sanitised HTML |
| `reloadModels()` | MODEL SELECTOR | Fetches model list from active provider |
| `openSettings()` | SETTINGS | Opens settings modal, runs aksInit + _gUpdateUI + initSettingsUI |
| `saveSettings()` | SETTINGS | Reads all settings fields, writes to S.cfg, calls persist() |
| `newChat()` | SIDEBAR | Creates new conversation, persists, resets view |
| `loadConv(id)` | SIDEBAR | Switches active conversation, restores state |
| `syncChatsToDrive(silent)` | DRIVE BACKUP | Uploads all conversations to Drive JSON file |
| `_restoreChatsFromDrive()` | DRIVE BACKUP | Downloads and merges Drive conversations on sign-in |
| `gDriveSyncNow()` | DRIVE BACKUP | Public alias for `syncChatsToDrive(false)` |
| `googleSignIn()` | GOOGLE OAUTH | Opens OAuth popup, stores token, triggers restore |
| `googleSignOut()` | GOOGLE OAUTH | Clears token, updates UI, updates sidebar footer |
| `LocalModelManager.downloadSelected()` | LOCAL MODEL | Downloads selected model to browser cache with progress |
| `LocalModelManager.generateResponse(msgs, cb)` | LOCAL MODEL | Runs inference, streams tokens |
| `_sendWithLocalModel(text)` | LOCAL MODEL | Full send/stream/render cycle using local model |
| `isEditIntent(text)` | PATCH EDIT | Returns true if text looks like a code edit request |
| `buildCodeStoreInjection(text)` | PATCH EDIT | Injects relevant code block into system context |
| `toast(msg, type)` | TOAST | Shows dismissible toast. type: `'ok'`\|`'er'`\|`'warn'` |
| `applyPresetPrompt(key)` | SYSTEM PROMPT | Loads a preset into the settings textarea |
| `exportAllData()` | PERSISTENCE | Downloads all conversations as JSON (no keys) |
| `importAllData()` | PERSISTENCE | Imports conversations from JSON with merge preview |
| `clearAllDataConfirm()` | PERSISTENCE | Clears IDB + SafeStorage + session keys with confirmation |
| `aksSwitch(prov, btn)` | API KEY UI | Switches provider tab in inline key section |
| `aksSaveKey()` | API KEY UI | Saves key to KeyStore, switches provider, reloads models |
| `aksClearKey()` | API KEY UI | Removes key for active provider |
| `_updateSidebarFooter()` | SIDEBAR FOOTER | Syncs footer between Google card and key status dot |
| `_akdClick()` | SIDEBAR FOOTER | Footer click → opens Settings, scrolls to right section |
| `updateCostDisplay()` | COST | Updates topbar cost display and budget bar |
| `calcCost(iTok, oTok)` | COST | Returns USD cost for a response |
| `setTheme(t)` | THEME | Switches `data-theme` attribute and persists |
| `applyFont(family, size)` | FONT | Applies font family and size to chat area |
| `renderChatList()` | SIDEBAR | Re-renders the conversation list in the sidebar |
| `renderMessages()` | MESSAGES | Re-renders all messages in the active conversation |
| `appendMsgEl(m)` | MESSAGES | Appends a single message bubble to `#chat-area` |
| `updateCtxBar()` | CONTEXT BAR | Updates context window fill percentage |

---

### CSS Variables

#### Dark theme (default)

| Variable | Value | Usage |
|---|---|---|
| `--bg` | `#0d0d14` | App background |
| `--bg2` | `#13131f` | Sidebar, secondary panels |
| `--surf` | `#1a1a2a` | Cards, inputs, surfaces |
| `--elev` | `#202033` | Elevated elements, chips |
| `--hov` | `#252538` | Hover states |
| `--bdr` | `rgba(255,255,255,.08)` | Borders everywhere |
| `--acc` | `#7c6aff` | Primary accent (purple) |
| `--acc2` | `#9d8fff` | Secondary accent, links |
| `--grn` | `#2dd4a0` | Success, connected, ready |
| `--amb` | `#f5a623` | Warning, loading states |
| `--red` | `#ff5f6d` | Error, destructive actions |
| `--tx1` | `#e8e8f5` | Primary text |
| `--tx2` | `#a0a0bc` | Secondary text |
| `--tx3` | `#5a5a72` | Placeholder, labels |
| `--rs` | `8px` | Border radius (small) |
| `--rx` | `6px` | Border radius (inputs) |

Light theme overrides all of these via `[data-theme="light"]` selectors in `atlas.css`.

---

### Data Formats

#### Conversation record (IndexedDB)

```json
{
  "id": "uuid-v4",
  "title": "First 50 chars of first user message",
  "msgs": [
    {
      "role": "user",
      "content": "string or array",
      "iTok": 0,
      "oTok": 0,
      "cost": 0,
      "files": [{ "name": "file.pdf", "type": "application/pdf" }],
      "imageResult": { "prompt": "...", "images": [{ "url": "..." }] },
      "toolCalls": [{ "id": "...", "function": { "name": "...", "arguments": "..." } }],
      "toolResults": null
    }
  ],
  "codeStore": [["blockId", { "lang": "html", "content": "..." }]]
}
```

#### Patch format

````
```patch
<<<< FIND
<lines to find>
====
<replacement lines>
>>>> REPLACE
```
````

#### Output format JSON — PDF example

````
```pdf-content
{
  "title": "Report Title",
  "author": "Optional Author",
  "sections": [
    {
      "heading": "Introduction",
      "body": "Paragraph text here.",
      "bullet_points": ["Point A", "Point B"]
    }
  ],
  "footer": "Optional footer text"
}
```
````

#### Output format JSON — PowerPoint example

````
```pptx-content
{
  "title": "Presentation Title",
  "slides": [
    {
      "title": "Slide Title",
      "body": "Optional subtitle",
      "bullets": ["Bullet 1", "Bullet 2"],
      "notes": "Optional speaker notes"
    }
  ]
}
```
````

#### Drive backup file

```json
{
  "version": 2,
  "exportedAt": "2025-05-10T12:00:00.000Z",
  "convs": []
}
```

---

### localStorage & IndexedDB Keys

| Key | Store | Content |
|---|---|---|
| `atlas_v1` | localStorage | JSON: `S.cfg`, `S.provider`, `S.model`, `S.theme`, `S.sbOpen`, `S.favModels`, `S.totalCost`, `S.budget` |
| `atlas_google_v1` | localStorage | JSON: `{accessToken, tokenExpiry, user, _lastSync}` |
| `atlas-local-model` | localStorage | Selected model ID string |
| `atlas-fallback-enabled` | localStorage | `"true"` or `"false"` |
| `atlas-local-model-downloaded` | localStorage | JSON array of downloaded model ID strings |
| `atlas_key_sess_<provider>` | sessionStorage | API key (sessionStorage only — never localStorage) |
| `atlas_db` v2 | IndexedDB | Object store `conversations` (keyPath: `id`) |

> API keys are **never** in localStorage. KeyStore uses the Credential Management API first. If unavailable, keys fall back to `sessionStorage` so they clear when the tab closes.

---

## Change Log

### Current build

**Local Model (WebGPU)**
- Added `LocalModelManager` IIFE using WebLLM 0.2.46
- Fixed ESM loading: replaced `<script src>` (which silently fails on ESM packages) with dynamic `import()` in `<script type="module">` storing result on `window.webllm`
- Added `webllm-ready` CustomEvent so the rest of the app reacts without polling
- Added `_waitForWebLLM()` Promise helper with 30-second timeout
- Fixed `setInitProgressCallback()` API — must be called on engine instance before `reload()`, not passed inside `reload()` config object
- Fixed progress parsing: `report.progress` stays `0` during the network download phase; `_parseProgress()` now extracts the `[N/M]` fraction from `report.text`
- Download button is disabled until WebLLM is loaded; re-enables via `webllm-ready` event listener

**API Key UI**
- Removed popup key modal (`#key-modal`) from `index.html`
- Added inline tabbed API key section in Settings with provider tabs (OpenRouter / DeepSeek / Gemini / OpenAI / Local)
- `openKeyModal()` now redirects to Settings + scrolls to API Keys section
- Added `aksSwitch()`, `aksSaveKey()`, `aksClearKey()`, `aksInit()`

**Google OAuth**
- Removed Gmail and Google Calendar tool connectors
- Scope reduced from `gmail.modify + calendar + drive` → `drive.file + email + profile`
- Google sign-in now used exclusively for chat history sync
- `_executeGoogleTool()` returns `null` (stub)

**Drive Chat Sync**
- Added `syncChatsToDrive()`, `_restoreChatsFromDrive()`, `_scheduleSync()`
- Wired `_scheduleSync()` into `persist()` (debounced 3 s)
- File: `atlas-chat-history.json` in user's Drive (private, `drive.file` scope)
- Merge strategy: Drive wins on ID conflict

**Sidebar footer**
- Added `#sb-google-signed-in` Google account card with avatar and "Chats saved to Drive"
- Added `_updateSidebarFooter()` — called after sign-in, sign-out, and key save
- Added `_akdClick()` — context-aware click handler (scrolls to Google or API key section)

### Prior notable additions

- **Patch edit system** — `isEditIntent()`, `buildCodeStoreInjection()`, patch format parser, large-file windowing
- **Visual editors** — Word-like DOCX editor and slide-based PPTX editor in the artifact panel
- **Continuation system** — Continue → button via `_doContinue()` for truncated responses
- **IndexedDB storage** — `ChatStorage` replacing localStorage for conversation history
- **Secure key storage** — `KeyStore` with Credential API + sessionStorage fallback
- **Right message nav** — Fixed-position message list panel (DeepSeek-style)
- **Skills system** — Built-in and custom skills with `INTENT_MAP` auto-detect
- **Output formats** — PDF, DOCX, PPTX, CSS format modes with structured JSON output
- **KaTeX math** — Inline `$...$` and block `$$...$$` LaTeX rendering
- **Clarifying questions** — Pattern-based ambiguity detection on first message of a conversation
- **Multi-provider support** — OpenRouter, DeepSeek, Gemini, OpenAI, local OpenAI-compatible servers
- **Image generation** — Dedicated image gen mode via OpenRouter image endpoint
