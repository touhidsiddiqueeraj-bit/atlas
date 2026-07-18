# Atlas — AI-Powered Work Assistant

**Atlas** is a single-page AI client for getting real work done — writing, coding, designing, editing, analyzing, and generating content. No backend, no build step, no telemetry. Runs entirely in your browser.

- **5 AI providers**: OpenRouter, DeepSeek, Gemini, OpenAI, local (Ollama/LM Studio/llama.cpp)
- **Offline-capable**: WebGPU local models via WebLLM (TinyLlama, StableLM, Gemma)
- **No build step**: Three files — `index.html`, `atlas.css`, `atlas.js` — serve from any HTTP server
- **Zero telemetry**: All network traffic goes only to your chosen AI providers and Google APIs (if signed in)

---

## Quick Start

### 5-Minute Setup

```bash
git clone https://github.com/yourusername/atlas.git
cd atlas
python3 -m http.server 8000
# Open http://localhost:8000
```

1. Open **Settings** (gear icon) → **API Keys**
2. Add at least one API key (OpenRouter, DeepSeek, Gemini, or OpenAI)
3. Select a model from the dropdown
4. Start chatting

### Using Offline (WebGPU)

1. Open **Settings** → **Local Model**
2. Toggle **"Use local model when no API key"**
3. Click **Download** next to a model (TinyLlama 1.1B ~638 MB, StableLM 1.6B ~900 MB, Gemma 2B ~1.2 GB)
4. Once downloaded, Atlas will automatically use the local model when no cloud key is set

Requires Chrome/Edge 113+ with WebGPU support.

---

## Features

### AI Chat

Chat with 5 provider backends through a unified interface:

| Provider | Key required | Model selection | Streaming | Notes |
|----------|-------------|-----------------|-----------|-------|
| **OpenRouter** | API key | 300+ models from dropdown | ✅ | Web search plugin, image gen models |
| **DeepSeek** | API key | Fallback list, fetches live on connect | ✅ | V4/V3/R1 series |
| **Gemini** | API key | Live model list from API | ✅ | Web search grounding, free tier |
| **OpenAI** | API key | Live model list from API | ✅ | GPT-4o, GPT-4.1 series |
| **Local** | None | Auto-detect Ollama, configurables | ✅ | Ollama, LM Studio, llama.cpp |

**Streaming** — responses appear token-by-token as they arrive. **Abort** — click the send button (now a stop icon) mid-generation. **Continuation** — truncated responses get a "Continue" button to resume. **Web search** — toggle to ground responses with real-time search results (OpenRouter plugin or Gemini Google Search grounding).

**Clarifying questions** — ambiguous first messages trigger a quick clarify bar with suggested options. Only fires once per conversation, on 15–25 word messages.

**Cost tracking** — per-token pricing data for OpenRouter/DeepSeek/Gemini models. Running total displayed in settings. Optional budget cap with a red/yellow/green fill bar.

---

### Full-Word Editing (Patch Edit)

Edit code and documents through natural language — tell Atlas what to change and it responds with surgical FIND/REPLACE patches instead of rewriting entire files.

**How it works:**

1. Atlas generates code in an artifact panel
2. Say: *"Change the button color to blue"* or *"Add a footer with the current year"*
3. Atlas automatically detects the edit intent, looks up the generated code in its `codeStore`, and sends a context window of the relevant section to the model
4. The model returns a JSON patch block:
   ```patch
   {"patches":[{"block_id":"blk_1","old_str":"background: red","new_str":"background: #3b82f6"}]}
   ```
5. `applyPatches()` replaces the text in the DOM and updates the `codeStore`

**Key features:**
- **Intent detection** (`isEditIntent`): edit keywords + code-context words + explicit block ID mentions
- **Large file windowing**: files over ~16,000 chars are scored by keyword relevance and only the top 3 windows (60 lines each) are sent — saves tokens
- **Patch mode enforcement**: the model is instructed to never rewrite the entire file, only output `\`\`\`patch` blocks
- **Smart Patch toggle** in Settings: disable to allow full rewrites

---

### Interactive Artifacts

Code blocks in AI responses can be opened in a side panel with three viewing modes:

- **Source** — raw syntax-highlighted code
- **Preview** — live `iframe` rendering (HTML output)
- **Visual Editor** — see Visual Editors section below

**Artifact panel features:**
- Multiple artifact tabs (click code blocks to add, close tabs individually)
- Drag-to-resize handle
- **Upload to Google Drive** — each artifact can be uploaded as a file with correct MIME type
- Reopening a code block updates the existing artifact tab rather than creating duplicates
- Artifact title auto-extracted from `<title>` tags or filename comments

---

### Visual Editors

Built-in WYSIWYG editors for DOCX and PPTX artifacts, accessible from the artifact panel's **Edit** toggle.

**DOCX Word Processor:**
- Rich-text editing (bold, italic, underline, font family, font size, text/background color)
- Align left/center/right, bullet lists, numbered lists
- Find & replace with match count
- Page setup (size, orientation, margins, columns, page numbers)
- Undo stack

**PPTX Slide Editor:**
- Slide navigation (add, delete, reorder, duplicate)
- Per-slide background color picker
- Title and body text with font/size/alignment controls
- Insert images and divider shapes
- Fullscreen presenter view

---

### Content Creation

Generate structured documents from chat — Atlas enforces a JSON schema that the model must follow, then converts it to downloadable files:

| Format | Schema | Libraries | Actions |
|--------|--------|-----------|---------|
| **PDF** | JSON with title, sections (heading/body/bullets), footer | jsPDF (lazy-loaded) | Download, Copy JSON |
| **DOCX** | JSON with title, sections (heading/body/bullets) | docx.js (lazy-loaded) | Download (renamed), Open in editor |
| **PPTX** | JSON with title, slides (title/body/bullets/notes) | pptxgenjs (lazy-loaded) | Download, Open in editor |
| **CSS** | Standard CSS in a fenced code block | None | Download as `.css` file, Copy |

Activate via the **Output Format** button (paper icon) or by typing "*Create a PDF report*" — Atlas auto-detects format intent.

---

### Image Generation

11 image generation models accessible through OpenRouter:

- `openai/dall-e-3`, `openai/dall-e-2`
- `stability/stable-diffusion-xl`, `stable-diffusion-3`, `stable-diffusion-3.5-large`
- `black-forest-labs/flux-1.1-pro`, `flux-schnell`, `flux-dev`, `flux-pro`
- `recraft-ai/recraft-v3`
- `ideogram-ai/ideogram-v2`

Toggle **Image Mode** (image icon) to send prompts as image generations. Results render inline in the chat. DALL-E models use the `/v1/images/generations` endpoint; others use `/v1/chat/completions` with image output.

---

### Skills System

Skills inject specialized system prompts to adjust Atlas's response style:

| Skill | Icon | Best for |
|-------|------|----------|
| **Frontend Design** | 🎨 | Production-grade UI components, web apps, animated interfaces |
| **Document Writing** | 📄 | Reports, memos, essays, structured documents |
| **Code Assistant** | 💻 | Clean code, debugging, algorithms, best practices |
| **Deep Analysis** | 🧠 | Research synthesis, critical thinking, systematic reasoning |
| **Data Analysis** | 📊 | Chart interpretation, statistics, data insights |
| **Game Development** | 🎮 | Game logic, game design, canvas-based games |

**Smart Auto-Detect** — when enabled, Atlas scans your message as you type and suggests the most relevant skill. Click to activate. Auto-detect only fires on the first message of a conversation.

**Custom Skills** — create your own skills with a name, description, and custom system prompt. Saved to localStorage. Listed alongside built-in skills in the settings panel.

---

### Web Search

Two web search implementations:

- **OpenRouter plugin** — sends `web_search` plugin parameter with API requests. Toggle via the search icon button. Auto-retries without search if the plugin causes a failure.
- **Gemini Google Search** — adds `google_search` tool to Gemini's `tools` parameter when web search is active on the Gemini provider. Results include source citations and search queries in the response metadata.

---

### Local Models (WebGPU)

Run small LLMs directly in the browser using WebLLM (v0.2.46) with WebGPU acceleration:

| Model | Size | RAM usage |
|-------|------|-----------|
| TinyLlama 1.1B | 638 MB | ~1.2 GB |
| StableLM 2 1.6B | 900 MB | ~1.8 GB |
| Gemma 2B | 1.2 GB | ~2.4 GB |

**Fallback mode** — when enabled in Settings, Atlas automatically routes to the local model when no cloud API key is configured. No page reload needed.

**Download flow** — models are downloaded once and cached via IndexedDB. Download progress is shown in the settings panel. The download button is disabled until the WebLLM library is loaded from CDN.

**GPU probe** — on settings open, Atlas probes for a WebGPU adapter. Shows the adapter name in settings (e.g. "AMD Radeon RX 580" or "SwiftShader (software)"). F16-capable adapters unlock more model variants.

**Session** — each response loads and unloads the model. The engine is reused within a session but reset on error to prevent stale state poisoning.

---

### Storage & Security

**Three-tier storage architecture:**

| Tier | Stores | Lifetime |
|------|--------|----------|
| **IndexedDB** (`atlas_db`) | Conversations, chat history | Persistent until cleared |
| **Credential API / sessionStorage** (`KeyStore`) | API keys | Browser-managed (or session) |
| **localStorage** (`atlas_v1`) | Settings, preferences, model cache | Persistent until cleared |

**Google Drive sync** — optional: sign in with Google OAuth (implicit grant, `drive.file` scope only). Chats are auto-synced to `atlas-chat-history.json` in your Drive (debounced 3 seconds after each change). Merge strategy restores on sign-in.

**Security model:**
- API keys stored in the Credential Management API when available (browser-managed, never accessible from JavaScript after save). Falls back to `sessionStorage` (lost on tab close) in Firefox.
- All AI provider traffic uses HTTPS
- User content rendered in an iframe with `sandbox` attribute
- DOMPurify sanitization on all markdown output
- No analytics, no telemetry, no external network calls except to user-configured AI providers and Google APIs

---

## Configuration

### Settings Panel (10 sections)

Open via the gear icon:

| Section | Controls |
|---------|----------|
| **Model** | Temperature, max tokens, top P, image size/model |
| **Google** | Sign in/out, account card |
| **API Keys** | Inline tabbed UI for each provider (OpenRouter, DeepSeek, Gemini, OpenAI) |
| **System Prompt** | Global system prompt textarea + 4 presets (Smart, Concise, Technical, Clear) |
| **Output / Style** | Smart Patch toggle, "Don'ts" textarea (things to avoid) |
| **Budget** | Total cost display, budget cap input |
| **Skills** | Smart Auto-Detect toggle, built-in skill badges, custom skill editor |
| **Storage** | Data export/import, clear all, storage usage |
| **Local Model** | Fallback toggle, model selector, download button with progress |
| **Themes & Fonts** | Dark/Light toggle, 9 fonts (DM Sans, Inter, Geist, Fira Code, JetBrains Mono, Source Serif 4, Lora, Nunito, Syne), font size slider (12–20px), 3 chat density modes |

### Themes & Display

- **Theme**: Dark (default) or Light — CSS custom properties throughout
- **Fonts**: 9 options loaded from Google Fonts on selection
- **Font size**: 12–20px slider with proportional element scaling
- **Density**: Compact / Normal / Spacious (controls message padding, bubble padding, chat area spacing)

---

## Interface Overview

```
┌──────────┬──────────────────────────────────────────┬────────┐
│ Sidebar  │              Chat Area                    │ Art.   │
│          │                                           │ Panel  │
│ • Chats  │  ┌─────────────────────────────────────┐  │        │
│ • Search │  │  User message              ✦ ✦ ✦   │  │ Source │
│ • New    │  │  AI response with code blocks ───── │  │ Preview│
│          │  │  [Artifact] to preview in panel      │  │ Editor │
│ Footer:  │  └─────────────────────────────────────┘  │        │
│ Google   │                                           │        │
│ account  │  [Input box — Shift+Enter newline]        │        │
│          │  [Send] [Web search] [Image] [Format]     │        │
└──────────┴──────────────────────────────────────────┴────────┘
```

- **Sidebar** — conversation list with search, delete, infinite scroll; Google account card in footer
- **Right message nav** — DeepSeek-style compact message list with 60-char snippets (auto-hides on mobile)
- **Artifact panel** — slides in from the right; resizable; tabs for multiple open artifacts
- **Debug panel** — `?debug=1` URL param enables raw API request/response viewer, IDB stats, and state snapshot

---

## Known Limitations

### Local Model (WebGPU)

- **First-message abort** — if the user clicks stop mid-first-response, the engine may enter a broken state. Subsequent sends hang silently. Workaround: reload the page. The engine is not reliably reset on abort.
- **Browser support** — WebGPU requires Chrome/Edge 113+. `navigator.gpu.requestAdapter()` may return `null` on some Linux configurations (e.g., Brave on AMD RX 580 with `shader-f16` unavailable). Falls back to SwiftShader software rendering when hardware adapter fails, but this is significantly slower.
- **Model variants** — all models use `q4f32_1` quantization (no `shader-f16` requirement). F16 variants are not used even when available for maximum compatibility.
- **Stale localStorage** — if a model ID in localStorage doesn't match the current `MODELS` array, it's auto-migrated to the first valid model. The dropdown UI may briefly show the wrong selection.
- **Rapid sends** — sending a second message while the engine is still processing a first may show "Engine is busy" or silently fail. Wait for the response to complete.
- **WebLLM 0.2.46** — `initProgressCallback` MUST be registered before `reload()`. Failing to do so causes the download progress bar to never update.

### Cloud Providers

- **Tool schemas** — tool definitions are sent with every API request, adding to token count and cost. Tools are always enabled; no per-request opt-out.
- **Gemini rate limits** — large token requests may hit per-minute rate limits. Atlas retries after a delay but may fail on sustained high throughput.
- **Web search retry** — if the OpenRouter web search plugin causes a network failure, Atlas retries the request without it. The web search toggle is automatically disabled during the retry.
- **Ollama CORS** — Ollama blocks cross-origin requests by default. Set `OLLAMA_ORIGINS=*` to allow Atlas to connect.

### Editing & Artifacts

- **Smart Patch reliability** — some models don't reliably follow the FIND/REPLACE patch format. They may output a full file rewrite instead. Disable Smart Patch in Settings if this is consistently problematic.
- **Artifact iframe sandbox** — the artifact preview iframe has `sandbox` attributes that may block scripts, styles, or external resources. If an artifact renders blank, check for syntax errors or sandbox-restricted features.
- **Multi-turn editing** — the `codeStore` accumulates code blocks throughout a conversation. Very long conversations with many code blocks may exceed context limits when building the injection prompt.
- **Large file windowing** — files >16,000 chars are windowed by keyword relevance. If the edit target is not in the selected windows, the model won't see it. The injection prompt instructs the model to ask the user to clarify in this case.

### Storage

- **`file://` protocol** — localStorage and IndexedDB may be unavailable or limited. Atlas shows an orange banner warning about storage restrictions. Always serve over HTTP or HTTPS.
- **Firefox** — the Credential Management API is not available. API keys are stored in `sessionStorage` and lost when the tab is closed.
- **Image attachments** — image data in file attachments is stripped on conversation save to keep IndexedDB usage manageable. Only metadata is retained.
- **40-message cap** — conversations are capped at the last 40 messages to keep performance predictable.
- **16-char titles** — conversation titles are truncated to 40 characters in the sidebar. The full first message is preserved.

### General

- **Auto-detect skills** — the Smart Auto-Detect feature only scans the first message of a conversation. Subsequent messages do not trigger skill suggestions.
- **Clarifying questions** — only trigger on first messages between 15–25 words. Very short or very long first messages skip the clarify step.
- **Context estimates** — the context bar shows estimated token usage. Estimates are approximate and may not match the provider's actual count.
- **Google Drive sync** — requires the user to sign in with Google OAuth. Sync is debounced at 3 seconds. Merge conflicts are not resolved; Drive is treated as the secondary source.
- **No offline mode** — while the local WebGPU model works without internet, cloud provider features (model list fetch, image generation, web search) require connectivity.

---

## Architecture Overview

**Three files, no build step, no framework:**

| File | Lines | Role |
|------|-------|------|
| `index.html` | ~970 | All HTML elements, element IDs, inline event handler attributes |
| `atlas.css` | ~1,430 | All styles, CSS custom properties, responsive rules, animations |
| `atlas.js` | ~11,000 | All application logic |

**State** — single global `S` object with ~20 fields for model, config, conversations, UI state. `persist()` serializes settings to localStorage.

**Lazy-loading** — libraries are loaded only on first use via dynamic `<script>` injection: jsPDF, docx.js, pptxgenjs, Marked, Highlight.js, KaTeX, DOMPurify, WebLLM.

**No backend server** — all network calls go directly from your browser to the AI provider APIs (+ Google APIs if signed in).

See `ARCHITECTURE.md` for the full developer deep-dive — code organization, data flows, storage internals, and the complete annotated section map of `atlas.js`.

---

## Developer Reference (compact)

### Key `S` state fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `S.key` | string | `''` | OpenRouter API key |
| `S.deepseekKey` | string | `''` | DeepSeek API key |
| `S.geminiKey` | string | `''` | Gemini API key |
| `S.openaiKey` | string | `''` | OpenAI API key |
| `S.provider` | string | `'openrouter'` | Active provider |
| `S.model` | object | `null` | Selected model object |
| `S.allModels` | array | `[]` | All available models |
| `S.convs` | array | `[]` | Conversations array |
| `S.msgs` | array | `[]` | Current conversation messages |
| `S.chatId` | string | `null` | Current conversation ID |
| `S.streaming` | bool | `false` | Whether a stream is active |
| `S.ac` | AbortController | `null` | Active abort controller |
| `S.webSearchMode` | bool | `false` | Web search toggle |
| `S.imageGenMode` | bool | `false` | Image gen mode toggle |
| `S.theme` | string | `'dark'` | 'dark' or 'light' |
| `S.codeStore` | Map | `Map()` | Block ID → {lang, content} for patch edits |
| `S.totalCost` | number | `0` | Running cost counter |
| `S.budget` | number | `0` | Budget cap (0 = unlimited) |

### Key functions

| Function | Line | Purpose |
|----------|------|---------|
| `sendMessage()` | 3255 | Central dispatch: route to local/clarify/image-gen/patch/stream |
| `renderMarkdown()` | 4264 | Custom markdown → HTML renderer |
| `previewCode()` | 6134 | Open a code block in the artifact panel |
| `applyPatches()` | 2937 | Apply FIND/REPLACE patches to the DOM |
| `reloadModels()` | 5502 | Rebuild model dropdown from provider API |
| `callGemini()` | *(inline)* | Gemini SSE streaming handler |
| `persist()` | 5035 | Save state to localStorage |
| `_sendWithLocalModel()` | 10126 | WebLLM local model send/receive loop |
| `generateImage()` | 1745 | Image generation via OpenRouter |
| `executeToolCall()` | 1626 | Run a tool function (web_search, calculator, etc.) |

### CSS Variables (Dark theme)

Key design tokens for theming — see `atlas.css` for the full set.

### Data Formats

- **Conversation**: `{ id, title, msgs: [{ role, content, files?, tool_calls? }] }` — saved to IndexedDB
- **Patch**: `{ patches: [{ block_id, old_str, new_str }] }` — sent as a `\`\`\`patch` fenced block
- **Output formats**: JSON schemas documented inline in `OUTPUT_FMT_CONFIG` (lines 948–1069)
- **localStorage keys**: `atlas_v1` (settings), `atlas_db` DB name (conversations)
