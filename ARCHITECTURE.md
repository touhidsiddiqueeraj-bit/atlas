# Atlas Architecture

This document covers the internal architecture, data flow, and code organization for developers working on Atlas.

---

## File System

Atlas is a single-page application with no framework, no build step, and no backend:

```
index.html          (~1,040 lines) — All HTML elements, element IDs, inline event handler attributes
atlas.css           (~2,000 lines) — All styles, CSS custom properties, animations, responsive rules
atlas.js            (~11,500 lines) — All application logic (chat, streaming, artifacts, editors)
modules/utils.js    (~55 lines) — Shared helpers: esc(), b64ToUtf8(), utf8ToB64(), clampLen()
modules/agent.js    (~1,020 lines) — Agent Mode: file extraction, project preview, zip/serve bundle
modules/artifact.js (~1,140 lines) — Artifact Document System: stream parser, versioned store,
                                   doc/mermaid views, chat cards, exports, Word-editor bridge
```

**Load order** (defined in `index.html`):

1. `modules/utils.js` — defines `esc`, `b64ToUtf8`, `utf8ToB64` (used everywhere)
2. `modules/agent.js` — defines `window.AgentMode` (used by `atlas.js`)
3. `modules/artifact.js` — defines `window.ArtifactDoc` (used by `atlas.js`)
4. `atlas.js` — the main app; reads `AgentMode`, `ArtifactDoc` and `esc` from the global scope

**Design principles:**
- No framework — vanilla JS for zero dependency overhead
- No build step — edit files directly, refresh browser
- Single `S` state object — no reactive system, explicit `persist()` calls
- Lazy-loading — CDN libraries injected on first use, never on page load
- Modules pattern — `modules/*.js` files are IIFEs that attach to `window` so the non-module `atlas.js` can call them

---

## State Management

A single global `S` object holds all runtime state:

```js
const S = {
  key: '', model: null, provider: 'openrouter',
  deepseekKey: '', geminiKey: '', openaiKey: '',
  localBaseUrl: 'http://localhost:11434',
  allModels: [], filtModels: [], activeFilter: 'all',
  convs: [], chatId: null, msgs: [],
  totalCost: 0, budget: 0,
  cfg: { temp: 0.55, maxTok: 4096, topP: 0.95, imgSize: '1024x1024', ... },
  streaming: false, ac: null,
  sbOpen: true, theme: 'dark',
  imageGenMode: false, webSearchMode: false,
  toolDefinitions: [],
  codeStore: new Map(),
  skills: { customSkills: [], activeSkillId: null, smartAuto: false },
};
```

There is no reactivity system. UI is updated imperatively after state changes. State persistence is manual:

- `persist()` serializes `S` (minus keys, minus conversations) to `localStorage` key `atlas_v1`
- Conversations are saved to IndexedDB separately via `ChatStorage`
- API keys are managed through `KeyStore` (Credential API → sessionStorage)

---

## Storage Layer

### Three tiers

```
┌─────────────────────────────────────────────────────────┐
│                    KeyStore                              │
│  Credential Management API → sessionStorage fallback     │
│  Stores: API keys (never in localStorage)               │
│  Lifetime: browser-managed / session                     │
├─────────────────────────────────────────────────────────┤
│                    ChatStorage                           │
│  IndexedDB (atlas_db v2, 'conversations' store)          │
│  Stores: { id, title, msgs[] } — full chat history       │
│  Lifetime: persistent until cleared                      │
├─────────────────────────────────────────────────────────┤
│                    localStorage                          │
│  key: atlas_v1                                           │
│  Stores: settings, preferences, filters, cost, codeStore │
│  (no keys, no conversations)                             │
│  Lifetime: persistent until cleared                      │
└─────────────────────────────────────────────────────────┘
```

### Google Drive sync

Optional add-on layer: when the user signs in with Google OAuth, `syncChatsToDrive()` debounces at 3s and writes `atlas-chat-history.json` to the user's Drive root. On sign-in, `_restoreChatsFromDrive()` merges Drive data into IndexedDB.

### localStorage keys

| Key | Content |
|-----|---------|
| `atlas_v1` | Full `S` state (minus keys, minus convs) |
| `atlas-local-model` | Selected WebLLM model ID |
| `atlas-fallback-enabled` | `"true"` or `"false"` |
| `atlas-local-model-downloaded` | JSON array of downloaded model IDs |

---

## Code Organization

`atlas.js` is organized into ~56 sections demarcated by `// ── SECTION NAME ──` comments. The file is processed top-to-bottom with IIFEs for contained subsystems (LocalModelManager, KeyStore, ChatStorage).

```
Section                         Lines      Role
────────────────────────────────────────────────────────────────
IMAGE GENERATION MODELS          41–55     IMAGE_GEN_MODELS array
FALLBACK MODEL LISTS             57–85     Provider model fallback lists
STATE                            87–115    Global S object
CONSTANTS                        117–121   MAX_CHAT_TITLE_LEN, MAX_CONV_MSGS, etc.
INIT                             123–154   DOMContentLoaded bootstrap
CLARIFYING QUESTIONS             161–257   Ambiguous-first-message handler
INTENT DETECTION                 258–362   isEditIntent, detectOutputFmt
SKILLS SYSTEM                    363–645   BUILTIN_SKILLS, custom skill CRUD
SKILL EDITOR                     646–943   Custom skill creation UI
OUTPUT FORMAT SYSTEM             944–1069  4 format modes (PDF/DOCX/PPTX/CSS)
FILE GENERATORS                  1071–1561  jsPDF/docx/pptxgenjs lazy-load + generate
TOOL DEFINITIONS                 1562–1623  web_search, calculator, time, image
TOOL EXECUTION                   1625–1743  executeToolCall, tool confirm dialog
IMAGE GENERATION                 1744–1918  generateImage, renderImageResult
API KEY UI                       1920–2233  Tabbed inline key input UI
OPENAI-COMPAT PROVIDER           2234–2500  URL normalization, endpoint probing, model discovery, manual models
MODEL SELECTOR                   2466–2661  Dropdown, filter, favourites
RIGHT MESSAGE NAV                2616–2661  DeepSeek-style compact msg list
SIDEBAR                          2662–2759  Conversations, search, delete
RENDER MESSAGES                  2761–2838  renderMessages, appendMsgEl
PATCH EDIT SYSTEM                2839–3029  isEditIntent, buildCodeStoreInjection, applyPatches
CONTINUATION SYSTEM              3030–3254  _doContinue, resume truncated response
SEND MESSAGE                     3255–4164  Central dispatch (10 stages)
RENDER IMAGES                    4165–4264  Image display in chat
MARKDOWN RENDERER                4264–4443  parseMarkdown + code block detection
FILES & PASTE                    4444–4603  File attachments, clipboard paste
COST TRACKER                     4605–4679  calcCost, updateCostDisplay
SETTINGS                         4680–6036  Tabbed Settings modal (Appearance/Model/API/Skills/Data), save/load/apply
ARTIFACT PANEL                   6130–6454  previewCode, artifact tabs, iframe
VISUAL EDITOR (DOCX)             6455–8036  Word-like rich-text editor
VISUAL EDITOR (PPTX)             8037–8831  PowerPoint slide editor
DOCX TOOLBAR                     8832–9065  DOCX formatting toolbar
ARTIFACT CLOSE                   9066–9120  Close/cleanup artifact panel
DRIVE UPLOAD                     9120–9290  Upload artifacts to Google Drive
CONTEXT BAR                      9291–9402  Token context fill bar
KATEX                            9362–9402  KaTeX on-demand loading
THEME                            9409–9426  Dark/light switching
FONT / DENSITY                   9427–9568  Font selector, size slider, 3 densities
DEBUG PANEL                      9583–9680  Raw API req/res viewer, IDB stats
GOOGLE OAUTH                     9681–9913  Implicit grant, token mgmt
TOOL CONFIRM DIALOG              9875–9907  Confirmation modal for tool execution
GOOGLE DRIVE BACKUP              9914–10046 Auto/manual Drive sync
SYSTEM PROMPT PRESETS            10047–10124 4 presets + applyPresetPrompt
ARTIFACT RESIZE                  10080–10097 Drag-to-resize handle
LOCAL MODEL MANAGER              10125–11012 WebLLM engine, download, inference
```

---

## Key Data Flows

### Custom (OpenAI-compatible) Endpoint Resolution

Any provider speaking the OpenAI chat-completions protocol connects through the **⚡ Custom** tab. All URL math is centralized in `atlas.js` (~line 2270):

```
user input ──▶ oaNormalizeBase()        trim / strip slashes / add http:// if missing
            ──▶ oaCandidateUrls(path)   [user layout, /v1 layout, unversioned layout] deduped
                          │
            ┌───────────┴───────────┐
       model listing              chat completions
   GET /v1/models (or /models)   oaChatFetch() — probes candidates on 404/405/501,
   then GET /api/tags (Ollama)   caches winner in S._localEpVariant (persisted),
   then manual model IDs         sends optional Bearer key
```

Key state: `S.localBaseUrl`, `S.localKey`, `S.localManualModels[]`, `S._localEpVariant{baseUrl,chat}`. The `local` provider id is kept for backward compatibility with saved settings. All three stream loops (send, regenerate, continue) plus the skill classifier route through these helpers, so a Perplexity-style unversioned gateway or a Groq-style `/openai/v1` base both work without configuration.

### Message Send Pipeline

```
sendMessage()
│
├─ 1. Abort if streaming → S.ac.abort()
├─ 2. No active key? → LocalModelManager fallback or open key modal
├─ 3. Clarifying questions? → showClarify(), pause
├─ 4. Image gen mode? → sendImageGeneration()
├─ 5. local-webgpu model selected? → _sendWithLocalModel()
├─ 6. No model selected? → toast error
├─ 7. Budget cap reached? → toast error
├─ 8. Create/update conversation → push msg, render, auto-save
├─ 9. Show thinking indicator
├─ 10. Build API request:
│   ├─ Gemini: callGemini() inline (streamGenerateContent)
│   ├─ OpenRouter/DeepSeek/OpenAI/Local: fetch() with stream:true
│   └─ Branch features: web search plugin, Gemini Google Search tool,
│       tool definitions, output format schemas, patch injection,
│       skill system prompt, global system prompt
├─ 11. Stream response → ReadableStream.getReader()
│   ├─ SSE parser for OpenAI-compat
│   ├─ Gemini streaming JSON parser
│   └─ Local model → generateResponse callback
├─ 12. Post-process:
│   ├─ Detect code blocks → previewCode() thumbnails
│   ├─ Parse markdown → renderMarkdown()
│   ├─ Track cost → updateCostDisplay()
│   └─ Save conversation
└─ 13. Done → enable send button, update UI
```

### Patch Edit Pipeline

```
User types: "Change the button color to green"

1. sendMessage() route
2. isEditIntent(text) → checks EDIT_KEYWORDS ∩ CODE_CONTEXT
3. buildCodeStoreInjection(text):
   a. pickRelevantBlock() → most relevant code block ID
   b. If file ≤ 16,000 chars → send entire file with line numbers
   c. If file > 16,000 chars → score lines by keyword relevance,
      pick top-3 windows of 60 lines each
   d. Append patch mode instructions (never full rewrite)
4. Model returns ```patch { patches: [{ block_id, old_str, new_str }] }
5. Response detected as patch → extractPatches(), applyPatches()
6. applyPatches() iterates:
   a. Find old_str in codeStore content (exact match)
   b. Replace with new_str
   c. Update DOM element
   d. Return { applied, failed, blockChanges }
7. Rendered in chat with diff highlights
```

### Artifact Document Pipeline (Claude-style)

```
System prompt (always-on, unless Output-Fmt/Agent Mode owns the message)
  └─ ARTIFACT DOCUMENT SYSTEM protocol: wrap substantial content in
     <artifact identifier="kebab-id" type="mime" title="…">…</artifact>

Streaming (per delta, all three loops: OpenAI-compat · Gemini (+429 retry,
+tool follow-up) · _doContinue):
  └─ ArtifactDoc.cleanForChat(full)          — modules/artifact.js
       ├─ ingest(full): incremental regex scan from _st.scanPos
       │    ├─ opening tag found → parse attrs → push/reuse version →
       │    │    activateArtifact() → panel opens → live render scheduled
       │    ├─ closing tag found → finalize version → final render
       │    └─ in-flight → update content → throttled _liveRender (140-900ms by kind)
       ├─ clean text: spans replaced by [[ARTIFACT:id]] tokens (cached prefix
       │    + partial-tag stripping so raw tags never flash in chat)
       └─ returned to renderMarkdown() → cards via \uE003 placeholders

Post-stream (aiMsg.content = ArtifactDoc.finalizeStream(full)):
  └─ tokens persist in the message; artifact records persist in
     chat.docArtifacts (IndexedDB) alongside chat.codeStore

Re-render (renderMessages → renderMarkdown):
  └─ extractCardTokens(): tokens (or raw spans from aborted streams —
     "rescue" path, store wins) → compact cards with version meta

Chat-driven update ("add a conclusion"):
  └─ sendMessage → ArtifactDoc.relevantArtifact(text)
       └─ explicit id/title mention, else edit-keywords + most recent doc;
          code-block edit intent (isEditIntent) still wins for codeStore blocks
       └─ buildArtifactContextInjection(rec): current content +
          "re-emit COMPLETE artifact with SAME identifier" → sysParts
       └─ model re-emits → new version (v1→v2), _collapseDup drops identical remissions

Selection edit (doc iframe):
  └─ text selected in srcdoc iframe → floating "✨ Edit with Claude" FAB →
     postMessage {atlas-art-edit} → #art-edit-modal → prompt built with
     identifier + selection → sendMessage()

Exports / editors:
  ├─ dlArtifact() → ArtifactDoc.openExportMenu() for _doc records
  │    ├─ md / styled html (standalone buildDocHtml) / svg / .mmd / rendered svg
  │    └─ pdf / docx: mdToDocxJson() → existing generatePDF / generateDOCX
  ├─ "📝 Word" header button → mdToDocxJson() → bridge artifact
  │    {id: '<identifier>:docx', lang: 'docx-content'} → _openVisualEditor()
  └─ applyArtEdit() routes _doc records to ArtifactDoc.applyManualEdit()
       → pushes a 'manual' version instead of touching codeStore

Record shape (S-independent Map inside ArtifactDoc, mirrored into _artifacts):
  { id, kind: doc|html|svg|mermaid|code, type, lang, title,
    versions: [{content, ts, finalized, msgIdx, origin?}],
    activeVersion, code (= versions[activeVersion].content), srcMsgIdx, _doc: true }

Stream state (per user message; survives auto-continuation):
  _st = { scanPos, raw, cleanText, rawBakedEnd, open, emissions }
```

Persistence keys: conversations store gains `docArtifacts` (array of records).
`autoSaveConversation` serializes; `loadChat` / `initSecureStorage` restore via
`ArtifactDoc.restore()`; `newChat` / `deleteChat` reset. Messages keep
`[[ARTIFACT:id]]` tokens; `buildApiMsgs` historyizes them to short references
(live content rides in the system prompt instead).

### Artifact Lifecycle (code-block artifacts)

```
Code block in AI response:
  └─ previewCode(blockId)
       ├─ Create/update _artifacts array entry { id, lang, code, title }
       ├─ activateArtifact(i)
       │    ├─ Update tab bar
       │    ├─ loadArtFrame() → iframe with rendered HTML
       │    └─ Open panel (class="open")
       │
       ├─ Tab bar: Source | Preview | Visual Editor
       │    ├─ Source → raw textarea with syntax color
       │    ├─ Preview → iframe srcdoc
       │    └─ Visual Editor → DOCX/PPTX editor (if structured) or text editor
       │
       ├─ User actions:
       │    ├─ Upload to Drive → _uploadArtifactToDrive()
       │    ├─ Resize → drag handle
       │    ├─ Close tab → closeArtTab()
       │    └─ Click another code block → update existing tab or add new
       │
       └─ On conversation save → codeStore persisted as Map in localStorage
```

### Google Drive Auth + Sync

```
Google Sign-In button
  └─ googleSignIn()
       ├─ Load Google Identity Services library (lazy)
       ├─ Initialize token client (drive.file scope, implicit grant)
       ├─ requestAccessToken() → prompts user
       ├─ On success:
       │    ├─ Store token in KeyStore (Credential API)
       │    ├─ Show account card in sidebar footer
       │    ├─ _restoreChatsFromDrive() → download atlas-chat-history.json
       │    │    ├─ If file exists → parse, merge into IndexedDB
       │    │    └─ If not → create placeholder
       │    └─ Start auto-sync (3s debounce on conversation changes)

Auto-sync (triggered by saveCurrentConv / persist):
  └─ syncChatsToDrive()
       ├─ Debounce 3000ms
       ├─ Download existing atlas-chat-history.json
       ├─ Compare conversation IDs
       ├─ Write updated JSON via Google Drive API (multipart upload)
       └─ Handle conflicts (Drive is secondary; local wins)
```

### Local Model Download → Inference

```
Settings → Local Model → Download button
  └─ LocalModelManager.downloadModel(modelId)
       ├─ Load WebLLM from CDN (dynamic import in plain <script>)
       ├─ Create MLCEngine
       ├─ Register initProgressCallback → update progress bar
       ├─ await engine.reload(modelId)
       │    └─ Downloads model weights via IndexedDB cache
       ├─ Save to _getCached() list
       └─ Enable "Send" button

Chat → sendMessage() → route to local-webgpu
  └─ _sendWithLocalModel(text)
       ├─ Build message history (last 20 turns)
       ├─ Show thinking indicator
       ├─ Create assistant message row in DOM
       ├─ await LocalModelManager.generateResponse(messages, callback)
       │    ├─ Load engine if not loaded
       │    ├─ Register streaming callback
       │    ├─ engine.chat.completions.create({ stream: true, ... })
       │    └─ Callback fires: status updates or text deltas
       ├─ Remove thinking indicator on first token
       ├─ Render markdown via DOMPurify + marked
       ├─ Save conversation
       ├─ On error: reset _engine = null, show error in bubble
       └─ On done: reset streaming state
```

---

## CSS Variables

```css
--base:   #0d0d12     /* Main background */
--surf:   #16161e     /* Surface / card background */
--elev:   #1c1c26     /* Elevated surface */
--hov:    #24242e     /* Hover state */
--bdr:    #2a2a36     /* Border color */
--tx1:    #e6e6f0     /* Primary text */
--tx2:    #a0a0b8     /* Secondary text */
--tx3:    #6a6a80     /* Tertiary / muted text */
--acc:    #7c6aff     /* Accent / primary action */
--acc2:   rgba(124,106,255,.3) /* Accent muted */
--red:    #ff5f6d     /* Error / danger */
--grn:    #4caf7d     /* Success */
--ylw:    #f5a623     /* Warning */
--rx:     8px          /* Border radius */
--rs:     6px          /* Small border radius */
```

Light theme overrides most of these via `.light` class selectors.

---

## Security Model

| Concern | Implementation |
|---------|---------------|
| **API key storage** | Credential Management API when available; `sessionStorage` fallback in Firefox. Keys never written to `localStorage`. |
| **XSS** | `DOMPurify.sanitize()` on all markdown-rendered output. User input is not rendered as raw HTML. |
| **Artifact sandbox** | iframe uses `sandbox="allow-scripts allow-same-origin"` — restricts form submission, popups, and navigation. |
| **Network** | All API calls go to user-configured provider endpoints + Google APIs (if signed in). No analytics, no telemetry, no external CDN calls beyond loaded libraries. |
| **Google OAuth** | Implicit grant flow. Scope limited to `drive.file` (only files created by the app). Token stored in Credential API. |
| **Data export** | Export JSON contains conversations only — API keys are never included. |
| **localStorage access** | Conversation data lives in IndexedDB, not localStorage. Only non-sensitive settings use `localStorage`. |
