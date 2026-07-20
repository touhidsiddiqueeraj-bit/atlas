# Agent Mode — Debug Investigation Log

## Goal
Agent workspace should auto-detect multi-file code responses, extract files to the sidebar file tree, and open the artifact preview panel. It works when the model outputs properly fenced code blocks (```` ```html ````) but fails silently when it doesn't.

## What was tried (original investigation — local work, never committed)

### Round 1 — Streaming crash fix
- **Streaming vulnerability**: gap between `S.streaming = true` and the first try block could lock streaming forever → wrapped setup in try/catch
- Stripped IndexedDB from `_agentVfs` (in-memory only)
- Removed Service Worker (`sw.js` deleted)
- Moved agent bar to top of sidebar + prominent styling
- Error-proofed `toggleAgentMode` with try-catch
- Strengthened `_agentExtractFilename` fallbacks
- Added loading feedback toast

**Result**: The 3.5-message streaming hang was fixed. Agent mode file extraction still broken.

### Round 2 — Panel-opening bug
- `_agentPreviewFile` called `previewCode(id)` which does `document.getElementById(id)` where `id = 'af:index.html'` — no DOM element has that id
- Fixed: changed to `activateArtifact(artIdx)`

**Result**: Same issue — file count stays 0.

### Round 3 — Debug logging (4 rounds)
Added `console.log` probes at every stage. **Key discovery** at `_agentProcessResponse` call:

```
sEl.html[0:300]: <p>&lt;!-- filename: index.html --&gt;<br>&lt;!DOCTYPE html&gt;...
[agent] called, codeBlks.length: 0
```

The raw model response (`full`) contains **zero backtick code fence markers** (`` ``` ``). The model outputs `<!-- filename: index.html -->` directly without any `` ```html `` wrapper. So `renderMarkdown` never creates `.code-blk` divs, `_agentProcessResponse` finds nothing, file count stays 0.

### Round 4 — Text fallback extraction
Added `_extractFilesFromText()` function that scans the rendered text content for filename comment patterns (`<!-- filename:...`, `// filename:...`, `/* filename:... */`, `# filename:...`) and extracts files even without code fences. Wired it into `_agentProcessResponse` as a fallback when no `.code-blk` elements found.

**Result**: Still didn't work — likely because `msgEl.querySelector('.md-body')` returns `null` at the point the fallback runs, or `sEl` is detached by the time extraction runs.

## Root cause summary (original analysis)

The model is **not reliably outputting fenced code blocks** despite the AGENT_PROMPT system instruction and the `[AGENT MODE]` user message prefix both telling it to do so. The extraction pipeline depends on `renderMarkdown` producing `.code-blk` DOM elements, which only happens when the raw text contains triple backtick fences. Without them, no code blocks exist to extract from.

## Key files (original references — these functions did NOT exist in the committed repo)
- `atlas.js` — all logic: streaming Gemini path ~3530-3953, `_agentProcessResponse` ~6338, `_extractFilesFromText` ~6333, `_agentPreviewFile` ~6383, `toggleAgentMode` ~1868
- `modules/utils.js` — `b64ToUtf8`/`utf8ToB64`

## Critical discovery (2026-07-20): the agent code was never committed

When picking this back up, the first thing checked was `git diff origin/main..HEAD --stat`:

```
AGENT-MODE-INVESTIGATION.md | 52 +++++++++++++++++++++++++++++++++++++++++++++
1 file changed, 52 insertions(+)
```

**The branch contains ONLY the investigation log.** Every function referenced above (`toggleAgentMode`, `_agentProcessResponse`, `_extractFilesFromText`, `_agentPreviewFile`, `_agentVfs`, `AGENT_PROMPT`) was local-only work that was never pushed. `grep -c "agent" atlas.js` returns `0`. There is no agent button in `index.html`, no agent CSS, no agent JS.

Additionally, `index.html` line 907 references `modules/utils.js` for `b64ToUtf8`/`utf8ToB64`/`esc`, but that file also doesn't exist in the repo — meaning the app was broken (ReferencesUndefinedFunction errors) even before considering agent mode.

## Re-implementation from scratch (2026-07-20)

Per user instruction "build from scratch", the entire agent feature was re-implemented cleanly, applying all four "Next steps" from the original analysis. The new implementation lives in three files:

### New files
- **`modules/utils.js`** (new) — Defines `esc()`, `b64ToUtf8()`, `utf8ToB64()`, `clampLen()`. Fixes the pre-existing broken state where these were referenced from `atlas.js` but never defined. UTF-8-safe (uses TextEncoder/TextDecoder, not raw btoa/atob which throw on non-ASCII).
- **`modules/agent.js`** (new) — Self-contained agent module. Exposes `window.AgentMode` with `isActive()`, `setActive()`, `toggle()`, `processResponse(raw)`, `renderTree()`, `clearFiles()`, `getSystemPrompt()`, `getUserPrefix()`, `openFile(name)`. Also exposes the legacy names `toggleAgentMode`, `_agentProcessResponse`, `_agentExtractFiles`, `_agentPreviewFile`, `_agentClearFiles`, `_agentDownloadAll`, `_agentRenderTree` on `window` for backward compatibility.

### Modified files
- **`index.html`** — Added the agent bar at the top of the sidebar (prominent, full-width, with switch knob), the agent file tree panel (below the bar, hidden by default), and the agent toggle button in the input-actions row (between web-search and send). Also added `<script src="modules/agent.js">` between `utils.js` and `atlas.js`.
- **`atlas.css`** — Added ~220 lines of agent-specific styles: the sidebar bar (with active gradient + glow), the switch knob, the file tree panel, the file entries (with extension badges), the Download All button, the input-zone button active state, and full light-theme overrides.
- **`atlas.js`** — Four surgical edits:
  1. Added `agentMode: false` to `S.cfg`.
  2. In `_init()`, restore agent state from `S.cfg.agentMode` on load (both the async path and the fallback path).
  3. In `sendMessage()`, prefix the user's message with `[AGENT MODE] ` and inject the `AGENT_PROMPT` system prompt when agent mode is active.
  4. In both the Gemini streaming path (~line 3855) and the OpenAI-compatible fetch path (~line 4117), call `AgentMode.processResponse(full)` AFTER the stream completes and BEFORE the message is saved. This is the critical fix — operating on the raw `full` string, not the rendered DOM.

### How the fix addresses each "Next step" from the original analysis

1. **"Debug why `msgEl.querySelector('.md-body')` returns null"** — Moot. The new implementation does not query the DOM at all during extraction. It operates on the raw `full` string captured during streaming.

2. **"Bypass DOM entirely — extract files from the raw `full` string"** — Done. `AgentMode.processResponse(raw)` is called with `full` directly. The extractor uses a two-pass strategy:
   - **Pass A (fenced)**: regex matches `` ```lang\n<code>``` `` blocks, looks for a filename comment in the first 5 lines, registers the file.
   - **Pass B (unfenced fallback)**: ONLY runs if Pass A found zero files. Scans the raw text for filename comments outside any fence, treats everything between two filename comments as one file's content. This catches the exact failure case from Round 3 of the investigation.
   
   The fallback is intentionally gated on "Pass A found nothing" — if the model is using fences AT ALL, we trust the fence-based extraction and don't fall back (which would create false positives on prose that happens to contain a filename-looking comment).

3. **"Strengthen prompting"** — Done. The `AGENT_PROMPT` system prompt is forceful and explicit:
   - Specifies the exact format (`` ```LANG \n <!-- filename: path --> \n ... \n ``` ``)
   - Lists accepted filename-comment forms (HTML, #, //, /*, --)
   - Requires a real language tag (never blank)
   - Requires relative paths with no leading slash
   - Asks for files in dependency order
   - Asks for one-line summaries between files (no long prose)
   - Tells the model to answer normally if the user isn't requesting code
   
   The `[AGENT MODE] ` user prefix reinforces this mid-conversation.

4. **"Remove leftover `[agent]` logs"** — Moot (clean re-implementation; no leftover logs).

### Verification

- **Syntax**: `node --check` passes on all three JS files (`utils.js`, `agent.js`, `atlas.js`).
- **Unit tests**: `/home/z/my-project/scripts/test-agent.js` — 51 assertions across 13 test cases, all passing. Covers:
  - Fenced multi-file extraction (the easy case)
  - **Unfenced extraction (the exact bug from Round 3)** — verified working
  - Subdirectory paths (`src/index.html`, `src/styles/main.css`)
  - Re-extraction updates content (model rewrites)
  - Re-extraction with no change returns 0
  - Patch blocks are NOT extracted as files
  - All comment styles (`#`, `//`, `/* */`, `--`, `<!-- -->`)
  - Toggle and state
  - Empty / null / undefined input
  - System prompt and user prefix content
  - Mixed fenced + unfenced (fallback correctly skipped)
  - Filename forms with `=` instead of `:`
- **Live browser test** (via `agent-browser`):
  - Page loads with zero JS errors (only the WebLLM load log)
  - Agent bar and agent button both visible and clickable
  - Clicking toggles the active state (bar + button both get `active` class, subtitle changes to "On — extracting files", input placeholder changes)
  - `AgentMode.processResponse(raw)` in the live browser extracted 3 files from a simulated fenced response
  - `AgentMode.processResponse(raw)` in the live browser extracted 1 file from the unfenced `<!-- filename: index.html -->` case (the original bug)
  - State persists across page reload (`S.cfg.agentMode` saved to localStorage, restored on `_init()`)
  - Screenshots saved to `/home/z/my-project/download/atlas-agent-mode-on.png`, `atlas-agent-files-extracted.png`, `atlas-agent-mode-restored.png`

### Architecture decisions

- **In-memory VFS only** — no IndexedDB, no Service Worker, no localStorage for the file contents themselves. The investigation log explicitly warned that persistence caused state-poisoning bugs. Only the `agentMode: true/false` toggle is persisted (in `S.cfg`); the extracted files live in a `Map` that clears on reload.
- **Reuse the existing artifact panel** — `AgentMode.openFile(name)` pushes into the existing `_artifacts` array and calls `activateArtifact(i)`. No duplicate preview UI. The artifact ID is prefixed `af:` so it can't collide with code-blk IDs (which are `cb` + hash).
- **Module pattern** — `modules/agent.js` is an IIFE that attaches to `window.AgentMode`. This keeps the agent logic self-contained and testable (the unit tests load it via `eval()` in Node with browser stubs) while still being callable from `atlas.js` (which is not a module).
- **Backward-compatible global names** — `toggleAgentMode`, `_agentProcessResponse`, etc. are exposed on `window` so any leftover references in `atlas.js` or inline `onclick` handlers keep working. (In this re-implementation there are none, but the aliases are there for safety.)

### How to use

1. Start the dev server: `python3 -m http.server 8000` from the repo root.
2. Open `http://localhost:8000` in a browser.
3. Click the hexagon-shaped Agent Mode button in the input-actions row (or click the "Agent Mode" bar at the top of the sidebar). The bar glows purple and the subtitle changes to "On — extracting files".
4. Set an API key (Settings → API Keys) and select a model.
5. Ask for a multi-file project: *"Build a todo list app with HTML, CSS, and JavaScript."*
6. As the model streams its response, Atlas extracts each file. When the stream completes, a toast shows "📦 Extracted N files — click in sidebar to open". The file tree appears in the sidebar.
7. Click any file in the tree to open it in the artifact panel (Source / Preview / Edit tabs all work as before).
8. Click "⬇ Download All" to download every extracted file in one action.
9. Click "✕" on the files panel header to clear the VFS.

### Known limitations

- **Mixed fenced + unfenced**: if the model uses fences for SOME files but not others, only the fenced files are extracted. This is by design (see Pass B gating above) — false positives from scanning unfenced prose would be worse than missing an unfenced file. Workaround: ask the model to re-output the missing file with fences.
- **No zip download**: "Download All" triggers N individual downloads, not a single .zip. A real zip would require bundling JSZip, which is out of scope for this fix.
- **No VFS persistence**: extracted files are lost on page reload. This is intentional (see Architecture decisions). If the user wants to keep them, they should download before reloading.
- **Agent mode + Smart Patch**: when both are on and the user asks to "edit" an existing file, the model may emit a `patch` block instead of a full file. The extractor correctly ignores `patch`/`json` blocks (Test 6), but no file is extracted in that case. This is correct behavior — patches modify existing codeStore entries, not the VFS.
