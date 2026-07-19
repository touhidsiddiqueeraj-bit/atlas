# Agent Mode — Debug Investigation Log

## Goal
Agent workspace should auto-detect multi-file code responses, extract files to the sidebar file tree, and open the artifact preview panel.

## What was tried

### Round 1 — Streaming crash fix
- Streaming vulnerability fixed: wrapped pre-try zone in try/catch
- Stripped IndexedDB from `_agentVfs` (in-memory only)
- Removed Service Worker (`sw.js` deleted)
- Moved agent bar to top of sidebar + prominent styling
- Error-proofed `toggleAgentMode` with try-catch
- Strengthened `_agentExtractFilename` fallbacks
- Added loading feedback toast

**Result**: Streaming hang fixed. Agent mode file extraction still broken.

### Round 2 — Panel-opening bug
- `_agentPreviewFile` called `previewCode(id)` where `id = 'af:index.html'` — no DOM element has that id
- Fixed: changed to `activateArtifact(artIdx)`

**Result**: Same — file count stays at 0.

### Round 3 — Debug logging
Added `console.log` probes at every stage. **Key discovery**:

```
sEl.html[0:300]: <p>&lt;!-- filename: index.html --&gt;<br>&lt;!DOCTYPE html&gt;...
[agent] called, codeBlks.length: 0
```

The raw model response (`full`) contains **zero backtick code fence markers**. The model outputs `<!-- filename: index.html -->` directly without any `` ```html `` wrapper. So `renderMarkdown` never creates `.code-blk` divs, `_agentProcessResponse` finds nothing.

### Round 4 — Text fallback extraction
Added `_extractFilesFromText()` that scans rendered text content for filename comment patterns and extracts files even without code fences.

**Result**: Still didn't work — likely `msgEl.querySelector('.md-body')` returns `null` at the point the fallback runs.

## Root cause
The model doesn't reliably output fenced code blocks despite the AGENT_PROMPT and `[AGENT MODE]` prefix. Extraction depends on `renderMarkdown` producing `.code-blk` DOM elements, which only happens with triple backtick fences.

## Key files
- `atlas.js` — all logic: Gemini path ~3530-3953, `_agentProcessResponse` ~6338, `_extractFilesFromText` ~6333, `_agentPreviewFile` ~6383, `toggleAgentMode` ~1868
- `modules/utils.js` — `b64ToUtf8`/`utf8ToB64`

## Next steps
1. Debug why `msgEl.querySelector('.md-body')` returns null in fallback
2. Bypass DOM entirely — extract from raw `full` string at line 3901
3. Strengthen model prompting for fenced code blocks
4. Remove any leftover `[agent]` logs
