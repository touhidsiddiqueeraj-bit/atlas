/**
 * Atlas — Agent Mode Module
 * File: modules/agent.js
 *
 * Goal
 *   When Agent Mode is ON, every assistant response is scanned for multi-file
 *   code output. Extracted files are stored in an in-memory VFS, rendered as a
 *   file tree in the sidebar, and any one can be opened in the existing
 *   artifact panel by clicking it.
 *
 * Why this exists (background)
 *   The previous in-tree implementation tried to extract files from the
 *   rendered DOM (querySelectorAll('.code-blk')). That breaks the moment the
 *   model emits a filename comment WITHOUT wrapping the code in a triple-
 *   backtick fence — renderMarkdown never produces a .code-blk in that case,
 *   so there is nothing to extract. The model does this often, especially
 *   with Gemini and smaller models.
 *
 *   This module fixes that by operating on the RAW response string — not the
 *   rendered DOM. It scans the model's verbatim text for both fenced and
 *   unfenced file boundaries, so it works regardless of how the model chose
 *   to format its output.
 *
 * Public API (called from atlas.js)
 *   - AgentMode.isActive()           → bool
 *   - AgentMode.toggle()             → void  (called by toggleAgentMode)
 *   - AgentMode.setActive(bool)      → void
 *   - AgentMode.processResponse(raw) → number (count of files extracted)
 *   - AgentMode.clearFiles()         → void
 *   - AgentMode.getSystemPrompt()    → string (the AGENT_PROMPT to inject)
 *   - AgentMode.getUserPrefix()      → string (the [AGENT MODE] prefix)
 *
 * The module exposes its functions on the global `AgentMode` object so the
 * existing atlas.js call sites (toggleAgentMode, _agentProcessResponse,
 * _agentExtractFiles, etc.) can be thin wrappers.
 */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────
  // The VFS is a simple Map: filename → { name, lang, content, addedAt }.
  // Filename is the relative path (e.g. "src/index.html"). Re-extracting the
  // same filename updates the content (model rewrites). We deliberately keep
  // this in-memory only — no IndexedDB, no Service Worker, no localStorage.
  // The investigation log explicitly warned that persistence caused state
  // poisoning bugs in the previous implementation.
  const _vfs = new Map();
  let _active = false;

  // ── The system prompt that forces multi-file output ────────────────────
  // Key requirements baked in (these are the fixes the investigation log
  // called "Next steps #3 — strengthen prompting"):
  //   1. Each file MUST be wrapped in a fenced code block with a language tag.
  //   2. Each fence MUST start with a filename comment on the first line.
  //   3. We accept several filename-comment forms so even when the model
  //      doesn't perfectly follow #1 and #2, the extractor still works.
  //   4. The reminder is forceful and short so it doesn't bloat tokens.
  const AGENT_PROMPT = [
    'You are in AGENT MODE.',
    '',
    'When the user asks you to build, create, or modify a multi-file project,',
    'you MUST output EVERY file as a separate fenced code block, in this exact',
    'format:',
    '',
    '```LANG',
    '<!-- filename: path/to/file.ext -->',
    '...file contents...',
    '```',
    '',
    'Rules:',
    '- Use a real language tag (html, css, javascript, python, etc.) — never leave the fence blank.',
    '- The FIRST line inside every fence MUST be a filename comment naming the file.',
    '  Accepted forms: <!-- filename: x --> | # filename: x | // filename: x | /* filename: x */',
    '- Use a relative path with no leading slash (e.g. "src/index.html", "styles.css").',
    '- Output files in dependency order: HTML before CSS before JS, etc.',
    '- Between fences, write a ONE-line summary of what the file does. No long prose.',
    '- If the user is asking a question (not requesting code), answer normally without fences.',
  ].join('\n');

  // Prefix prepended to every user message while agent mode is on — reinforces
  // the system prompt mid-conversation, which the investigation log called for
  // as "Next steps #3".
  const USER_PREFIX = '[AGENT MODE] ';

  // ── Language detection helpers ─────────────────────────────────────────
  // Maps a file extension to a code-blk language tag. Used when the model
  // omits the language on the fence but does include a filename comment — we
  // derive the language from the filename.
  const EXT_TO_LANG = {
    html: 'html', htm: 'html',
    css: 'css',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    jsx: 'jsx', tsx: 'tsx',
    ts: 'typescript',
    json: 'json',
    py: 'python',
    rb: 'ruby',
    php: 'php',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
    cs: 'csharp',
    sh: 'bash', bash: 'bash',
    yml: 'yaml', yaml: 'yaml',
    toml: 'toml',
    md: 'markdown',
    xml: 'xml',
    sql: 'sql',
    svg: 'svg',
    txt: 'text',
  };

  function langFromFilename(name) {
    const m = name.match(/\.([a-zA-Z0-9]+)$/);
    if (!m) return 'text';
    return EXT_TO_LANG[m[1].toLowerCase()] || 'text';
  }

  function extFromLang(lang) {
    const map = {
      html: 'html', css: 'css', javascript: 'js', js: 'js',
      typescript: 'ts', ts: 'ts', jsx: 'jsx', tsx: 'tsx',
      json: 'json', python: 'py', py: 'py', ruby: 'rb', rb: 'rb',
      php: 'php', go: 'go', rust: 'rs', rs: 'rs', java: 'java',
      kotlin: 'kt', kt: 'kt', swift: 'swift', c: 'c', cpp: 'cpp',
      csharp: 'cs', cs: 'cs', bash: 'sh', sh: 'sh', yaml: 'yaml',
      yml: 'yml', toml: 'toml', markdown: 'md', md: 'md', xml: 'xml',
      sql: 'sql', svg: 'svg', text: 'txt',
    };
    return map[(lang || '').toLowerCase()] || 'txt';
  }

  // ── Filename extraction ────────────────────────────────────────────────
  // Pull a filename out of a comment line. Handles every common form:
  //   <!-- filename: src/index.html -->
  //   # filename: src/index.html
  //   // filename: src/index.html
  //   /* filename: src/index.html */
  //   // src/index.html
  //   # src/index.html
  // Returns the cleaned filename or null.
  function _extractFilename(line) {
    if (!line) return null;
    const stripped = line.trim();

    // Form 1: explicit "filename:" comment
    const m1 = stripped.match(/(?:filename|file)\s*[:=]\s*["'`]?([\w\-./]+\.[\w]+)["'`]?/i);
    if (m1) return _cleanPath(m1[1]);

    // Form 2: bare path after a comment marker — but ONLY if it has an extension
    // and no other text. This avoids false positives like "// set up the config".
    const m2 = stripped.match(/^(?:\/\/|#|\/\*|--|;)\s*([\w\-./]+\.[\w]+)\s*(?:\*\/)?$/);
    if (m2) {
      // Reject things like "example.com" or "v1.0.0" — we want file paths
      const candidate = m2[1];
      if (/[\\/]/.test(candidate) || /\.(html?|css|js|mjs|cjs|jsx?|tsx?|json|py|rb|php|go|rs|java|kt|swift|c|cc|cpp|hpp|cs|sh|bash|ya?ml|toml|md|xml|sql|svg|txt|env|gitignore|dockerfile)$/i.test(candidate)) {
        return _cleanPath(candidate);
      }
    }

    return null;
  }

  // Normalize a path: strip leading ./ and /, collapse ../ resolves (best-effort),
  // and reject anything that tries to escape via .. or absolute paths.
  function _cleanPath(p) {
    let s = String(p || '').trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
    // Strip leading slashes — we want relative paths only
    s = s.replace(/^\/+/, '');
    // Resolve .. segments
    const parts = [];
    for (const part of s.split('/')) {
      if (part === '' || part === '.') continue;
      if (part === '..') { parts.pop(); continue; }
      parts.push(part);
    }
    const cleaned = parts.join('/');
    if (!cleaned || !cleaned.includes('.')) return null; // need at least one dot (extension)
    if (cleaned.length > 200) return null; // sanity cap
    return cleaned;
  }

  // ── Core: extract files from raw model text ────────────────────────────
  // This is the heart of the fix. The previous implementation worked off the
  // rendered DOM (.code-blk elements), which only exist if the model wraps
  // output in triple-backtick fences. This function works off the RAW string
  // — so it catches both fenced and unfenced outputs.
  //
  // Strategy (two passes):
  //   Pass A — fenced blocks: regex-extract every ```lang\n<code>``` block.
  //            For each, look at the first ~5 lines for a filename comment.
  //            If found, register { filename, lang, content }.
  //   Pass B — unfenced blocks: if Pass A found 0 files, scan the raw text
  //            for filename comments that AREN'T inside a fence, and grab
  //            everything between that comment and the next filename comment
  //            (or end of text). This catches the "model just barfs HTML with
  //            <!-- filename: index.html --> at the top and no fences" case
  //            that the investigation log specifically called out.
  //
  // Returns: number of NEW or UPDATED files extracted.
  function _extractFiles(raw) {
    if (!raw || typeof raw !== 'string') return 0;
    const found = []; // { filename, lang, content }

    // ── Pass A: fenced code blocks ──
    // Match ```lang\n<code>``` — note the non-greedy [sS]*? so we don't
    // swallow subsequent blocks. Allow the fence to be unclosed at EOF
    // (happens during streaming) by also matching a trailing unclosed fence.
    const fenceRe = /```([\w-]*)\n([\s\S]*?)(?:```|$)/g;
    let m;
    while ((m = fenceRe.exec(raw)) !== null) {
      const lang = (m[1] || '').toLowerCase().trim();
      const body = m[2];
      // Skip patch/json patch blocks — those are consumed by applyPatches
      if (lang === 'patch' || lang === 'json') continue;
      // Look for a filename comment in the first 5 non-empty lines
      const lines = body.split('\n');
      let fname = null;
      let fnameLineIdx = -1;
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const f = _extractFilename(lines[i]);
        if (f) { fname = f; fnameLineIdx = i; break; }
      }
      if (!fname) continue; // no filename → not a file, skip
      // Strip the filename comment line from the content
      const contentLines = lines.slice(fnameLineIdx + 1);
      // Trim leading blank lines and trailing whitespace
      while (contentLines.length && contentLines[0].trim() === '') contentLines.shift();
      const content = contentLines.join('\n').replace(/\s+$/, '');
      if (!content) continue;
      const effectiveLang = lang || langFromFilename(fname);
      found.push({ filename: fname, lang: effectiveLang, content });
    }

    // ── Pass B: unfenced fallback ──
    // Only run if Pass A found nothing. Scan the raw text for filename
    // comments OUTSIDE any fence. The content of each "file" is everything
    // from the line after the filename comment up to the next filename
    // comment or end of text.
    if (found.length === 0) {
      // First, strip fenced blocks so we don't double-count
      const stripped = raw.replace(/```[\w-]*\n[\s\S]*?```/g, '');
      const lines = stripped.split('\n');
      const markers = []; // { lineIdx, filename }
      for (let i = 0; i < lines.length; i++) {
        const f = _extractFilename(lines[i]);
        if (f) markers.push({ lineIdx: i, filename: f });
      }
      for (let i = 0; i < markers.length; i++) {
        const start = markers[i].lineIdx + 1;
        const end = i + 1 < markers.length ? markers[i + 1].lineIdx : lines.length;
        const contentLines = lines.slice(start, end);
        // Trim leading/trailing blank lines
        while (contentLines.length && contentLines[0].trim() === '') contentLines.shift();
        while (contentLines.length && contentLines[contentLines.length - 1].trim() === '') contentLines.pop();
        const content = contentLines.join('\n');
        if (!content || content.length < 5) continue;
        // Skip if content looks like prose (very low line count, no code-y chars)
        // — this filters out one-liner summaries that happen to follow a filename
        if (contentLines.length < 2 && !/[{};<>=]/.test(content)) continue;
        found.push({
          filename: markers[i].filename,
          lang: langFromFilename(markers[i].filename),
          content,
        });
      }
    }

    // ── Commit to VFS ──
    let changed = 0;
    for (const f of found) {
      const existing = _vfs.get(f.filename);
      if (!existing || existing.content !== f.content) {
        _vfs.set(f.filename, {
          name: f.filename,
          lang: f.lang,
          content: f.content,
          addedAt: Date.now(),
        });
        changed++;
      }
    }
    return changed;
  }

  // ── File tree rendering ────────────────────────────────────────────────
  // Builds a nested tree from flat "a/b/c.ext" paths and renders it into
  // #agent-file-tree. Clicking a file calls _agentPreviewFile(name).
  function _buildTree(paths) {
    const root = { dirs: {}, files: [] };
    for (const p of paths) {
      const parts = p.split('/');
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i];
        if (!node.dirs[seg]) node.dirs[seg] = { dirs: {}, files: [] };
        node = node.dirs[seg];
      }
      node.files.push(parts[parts.length - 1]);
    }
    return root;
  }

  // Map file extensions to emoji icons for the file tree.
  // Returns a single emoji that represents the file type.
  function _fileIcon(name) {
    const ext = (name.match(/\.([a-zA-Z0-9]+)$/) || [])[1]?.toLowerCase() || '';
    if (['html', 'htm'].includes(ext)) return '🌐';
    if (['css'].includes(ext)) return '🎨';
    if (['js', 'mjs', 'cjs', 'jsx'].includes(ext)) return '📜';
    if (['ts', 'tsx'].includes(ext)) return '📘';
    if (['json'].includes(ext)) return '⚙️';
    if (['py'].includes(ext)) return '🐍';
    if (['md'].includes(ext)) return '📝';
    if (['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return '🖼️';
    if (['sql'].includes(ext)) return '🗄️';
    if (['sh', 'bash'].includes(ext)) return '⚡';
    if (['env', 'gitignore', 'dockerfile'].includes(ext) || name.toLowerCase().startsWith('dockerfile')) return '🐳';
    if (['xml'].includes(ext)) return '📦';
    if (['yml', 'yaml', 'toml'].includes(ext)) return '⚙️';
    return '📄';
  }

  function _renderTreeNode(node, prefix, htmlOut) {
    // Dirs first (sorted), then files (sorted)
    const dirNames = Object.keys(node.dirs).sort();
    for (const d of dirNames) {
      const path = prefix ? prefix + '/' + d : d;
      htmlOut.push(`<div class="agent-ft-dir">📁 ${esc(d)}</div>`);
      _renderTreeNode(node.dirs[d], path, htmlOut);
    }
    const files = node.files.slice().sort();
    for (const f of files) {
      const fullPath = prefix ? prefix + '/' + f : f;
      const icon = _fileIcon(f);
      htmlOut.push(
        `<div class="agent-ft-file" onclick="AgentMode.openFile('${fullPath.replace(/'/g, "\\'")}')">` +
        `<span class="agent-ft-icon">${icon}</span>` +
        `<span class="agent-ft-name">${esc(f)}</span>` +
        `</div>`
      );
    }
  }

  function _renderTree() {
    const panel = document.getElementById('agent-files-panel');
    const treeEl = document.getElementById('agent-file-tree');
    const countEl = document.getElementById('agent-files-count');
    if (!panel || !treeEl || !countEl) return;

    const paths = Array.from(_vfs.keys()).sort();
    countEl.textContent = String(paths.length);

    if (paths.length === 0) {
      panel.style.display = _active ? 'flex' : 'none';
      treeEl.innerHTML = '<div class="agent-ft-empty">No files extracted yet.<br>Send a code request to populate.</div>';
      return;
    }

    panel.style.display = 'flex';
    const html = [];
    const root = _buildTree(paths);
    _renderTreeNode(root, '', html);
    treeEl.innerHTML = html.join('');
  }

  // ── Open a file in the artifact panel ──────────────────────────────────
  // We REUSE the existing artifact panel via the global _artifacts array and
  // activateArtifact() function — both defined in atlas.js. We do NOT call
  // previewCode() because that expects a DOM element with a data-raw attr.
  // Instead we push directly into _artifacts and call activateArtifact().
  //
  // SMART OPEN: if the clicked file is HTML AND the VFS contains other files
  // (CSS, JS, images), we open it as a "project" — a composite artifact that
  // (a) renders the full website in the Preview tab (CSS/JS inlined), and
  // (b) lets the user switch between files in the Source and Edit tabs.
  // This is what users actually want when they ask "view and edit the website".
  function _openFile(filename) {
    const entry = _vfs.get(filename);
    if (!entry) {
      if (typeof toast === 'function') toast('File not found: ' + filename, 'er');
      return;
    }
    // Defensive: if atlas.js hasn't loaded yet (shouldn't happen, but be safe)
    if (typeof _artifacts === 'undefined' || typeof activateArtifact !== 'function') {
      console.warn('[AgentMode] atlas.js not ready — cannot open file');
      return;
    }

    // If HTML and the VFS has more than just this one file → open as project.
    // Single isolated HTML file → open as a normal HTML artifact (old path).
    const isHtml = entry.lang === 'html' || /\.html?$/i.test(filename);
    const hasMultipleFiles = _vfs.size > 1;
    if (isHtml && hasMultipleFiles) {
      _openProject(filename);
      return;
    }

    // Fallback: single-file artifact (preserves previous behavior)
    const id = 'af:' + filename;
    const title = entry.lang.toUpperCase() + ' — ' + filename;
    const existing = _artifacts.findIndex(a => a.id === id);
    if (existing >= 0) {
      _artifacts[existing].code = entry.content;
      _artifacts[existing].lang = entry.lang;
      _artifacts[existing].title = title;
      // Clear any project metadata — single file mode
      delete _artifacts[existing]._isProject;
      delete _artifacts[existing]._projectFiles;
      delete _artifacts[existing]._activeFile;
      activateArtifact(existing);
    } else {
      _artifacts.push({ id, lang: entry.lang, code: entry.content, title });
      activateArtifact(_artifacts.length - 1);
    }
    // On mobile, close the sidebar so the artifact panel is visible
    if (window.innerWidth <= 600 && typeof closeSb === 'function') {
      try { closeSb(); } catch (e) {}
    }
  }

  // ── Build a composite HTML preview with CSS/JS inlined ─────────────────
  // Takes the entry-point HTML filename, finds all <link rel="stylesheet">
  // and <script src="..."> tags that reference files ALSO in the VFS, and
  // inlines their content directly into the HTML. The result is a single
  // self-contained HTML document that renders correctly in an iframe srcdoc.
  //
  // External URLs (https://..., data:, //cdn...) are left alone — only
  // relative paths matching a VFS file are inlined.
  //
  // This is the foundation of "view the website" — without it, the iframe
  // would try to fetch styles.css from a non-existent server.
  function _buildWebsitePreview(entryFilename) {
    const entry = _vfs.get(entryFilename);
    if (!entry) return '';
    let html = entry.content;

    // Compute the entry file's directory so we can resolve relative paths.
    // E.g. for "src/pages/index.html" the dir is "src/pages/".
    const dir = entryFilename.includes('/')
      ? entryFilename.split('/').slice(0, -1).join('/') + '/'
      : '';

    // Resolve a relative href/src against the entry's directory.
    function resolveRef(ref) {
      if (!ref) return null;
      // Skip absolute URLs and protocol-relative URLs
      if (/^(https?:)?\/\//i.test(ref)) return null;
      if (ref.startsWith('data:')) return null;
      if (ref.startsWith('//')) return null;
      // Strip leading ./ and /
      let p = ref.replace(/^\.\//, '').replace(/^\//, '');
      // Combine with dir, then normalize (collapse . and ..)
      const combined = dir + p;
      const parts = [];
      for (const seg of combined.split('/')) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') { parts.pop(); continue; }
        parts.push(seg);
      }
      return parts.join('/');
    }

    // Inline <link rel="stylesheet" href="..."> tags
    html = html.replace(
      /<link\s+[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi,
      (match) => {
        const hrefMatch = match.match(/href\s*=\s*["']([^"']+)["']/i);
        if (!hrefMatch) return match;
        const resolved = resolveRef(hrefMatch[1]);
        if (!resolved) return match; // external or unresolvable
        const cssEntry = _vfs.get(resolved);
        if (!cssEntry) return match; // not in VFS — leave the link as-is
        return '<style data-atlas-inlined="' + resolved + '">\n' +
               cssEntry.content +
               '\n</style>';
      }
    );

    // Inline <script src="..."></script> tags (without inline content already)
    html = html.replace(
      /<script\s+([^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*)>\s*<\/script>/gi,
      (match, attrs, src) => {
        const resolved = resolveRef(src);
        if (!resolved) return match; // external
        const jsEntry = _vfs.get(resolved);
        if (!jsEntry) return match; // not in VFS
        // Preserve type attribute if specified (e.g. type="module")
        const typeMatch = attrs.match(/type\s*=\s*["']([^"']+)["']/i);
        const typeAttr = typeMatch ? ' type="' + typeMatch[1] + '"' : '';
        return '<script' + typeAttr + ' data-atlas-inlined="' + resolved + '">\n' +
               jsEntry.content +
               '\n<\/script>';
      }
    );

    return html;
  }

  // ── Open a multi-file project in the artifact panel ────────────────────
  // Pushes a project artifact with these fields:
  //   id:           'af:project:' + entryFilename
  //   lang:         'html'
  //   code:         the COMPOSITE html (CSS/JS inlined) — used by Preview
  //   _origCode:    the entry HTML's original source (no inlining) — Source tab default
  //   _isProject:   true
  //   _projectFiles: Map<filename, {content, lang}> — snapshot of VFS at open time
  //   _activeFile:  filename currently shown in Source/Edit
  //
  // atlas.js's loadArtFrame / toggleArtSource / toggleArtEdit / applyArtEdit
  // all check _isProject and behave accordingly.
  function _openProject(entryFilename) {
    const entry = _vfs.get(entryFilename);
    if (!entry) return;
    const id = 'af:project:' + entryFilename;
    const title = '🌐 ' + entryFilename.split('/').pop() + ' — Project';

    // Snapshot the VFS so the artifact has its own copy (in case the user
    // clears the VFS later, the open artifact still works).
    const projectFiles = new Map();
    _vfs.forEach((v, k) => {
      projectFiles.set(k, { content: v.content, lang: v.lang, name: v.name });
    });

    const compositeHtml = _buildWebsitePreview(entryFilename);
    const origHtml = entry.content;

    const existing = _artifacts.findIndex(a => a.id === id);
    const art = {
      id,
      lang: 'html',
      code: compositeHtml,
      title,
      _isProject: true,
      _projectFiles: projectFiles,
      _projectRoot: entryFilename,
      _activeFile: entryFilename,
      _origCode: origHtml,
    };
    if (existing >= 0) {
      _artifacts[existing] = art;
      activateArtifact(existing);
    } else {
      _artifacts.push(art);
      activateArtifact(_artifacts.length - 1);
    }

    // On mobile, close the sidebar so the artifact panel is visible
    if (window.innerWidth <= 600 && typeof closeSb === 'function') {
      try { closeSb(); } catch (e) {}
    }
    if (typeof toast === 'function') {
      toast('🌐 Opened ' + entryFilename.split('/').pop() + ' — ' + projectFiles.size + ' files in project', 'ok');
    }
  }

  // ── Download all files as a single ZIP ─────────────────────────────────
  // Uses JSZip (lazy-loaded from CDN, same lib already used by the PPTX
  // generator). Preserves the folder structure. The zip downloads as
  // "atlas-project-YYYY-MM-DD.zip".
  async function _downloadAll() {
    if (_vfs.size === 0) {
      if (typeof toast === 'function') toast('No files to download', 'er');
      return;
    }
    try {
      if (typeof loadScript !== 'function') {
        throw new Error('loadScript not available');
      }
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      const zip = new JSZip();
      _vfs.forEach((entry, filename) => {
        // JSZip auto-creates folder structure when the path contains slashes
        zip.file(filename, entry.content);
      });
      // Add a small README explaining what this is
      const ts = new Date().toISOString().slice(0, 10);
      zip.file(
        'README.txt',
        'Atlas Project Export\n' +
        'Exported: ' + new Date().toString() + '\n' +
        'Files: ' + _vfs.size + '\n\n' +
        'To preview locally:\n' +
        '  python3 -m http.server 8000\n' +
        '  # then open http://localhost:8000 in a browser\n\n' +
        'Generated by Atlas — AI Chat'
      );
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'atlas-project-' + ts + '.zip';
      a.click();
      URL.revokeObjectURL(url);
      if (typeof toast === 'function') {
        toast('📦 Downloaded ' + _vfs.size + ' files as zip', 'ok');
      }
    } catch (e) {
      console.error('[AgentMode] zip failed:', e);
      if (typeof toast === 'function') {
        toast('Zip failed: ' + e.message + ' — falling back to individual downloads', 'er');
      }
      // Fallback: individual downloads (the old behavior)
      _vfs.forEach((entry) => {
        const blob = new Blob([entry.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = entry.name.split('/').pop();
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  }

  // ── Serve Locally: generate a runnable server bundle ───────────────────
  // Atlas has no backend, so it cannot actually start a server from JS.
  // The next-best "one click" experience: produce a single zip that contains
  // (a) all the VFS files in their folder structure, and
  // (b) a start.sh / start.bat that auto-detects an available HTTP server
  //     (python3 → python → npx http-server → php built-in), starts it on
  //     port 8000, prints the LAN URL to visit from other devices, and
  //     tries to open the user's default browser.
  //
  // The user double-clicks start.sh (or runs it in terminal) and gets a
  // working local server. Other devices on the same Wi-Fi visit the printed
  // URL. This is the most pragmatic cross-platform solution without a backend.
  async function _serveLocally() {
    if (_vfs.size === 0) {
      if (typeof toast === 'function') toast('No files to serve — extract some first', 'er');
      return;
    }
    try {
      if (typeof loadScript !== 'function') {
        throw new Error('loadScript not available');
      }
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      const zip = new JSZip();

      // Add all VFS files preserving folder structure
      _vfs.forEach((entry, filename) => {
        zip.file(filename, entry.content);
      });

      // Find the entry-point HTML file (prefer index.html at root, then
      // any index.html, then any .html file)
      const allPaths = Array.from(_vfs.keys());
      const rootIndex = allPaths.find(p => p === 'index.html');
      const anyIndex = allPaths.find(p => p.endsWith('/index.html') || p === 'index.html');
      const anyHtml = allPaths.find(p => /\.html?$/i.test(p));
      const entry = rootIndex || anyIndex || anyHtml || 'index.html';

      // start.sh — Mac/Linux
      const startSh = [
        '#!/usr/bin/env bash',
        '# Atlas local server — generated by Atlas AI Chat',
        '# Serves the project files over HTTP so other devices on the same',
        '# Wi-Fi network can visit them.',
        '#',
        '# Double-click this file (Mac) or run `bash start.sh` in terminal.',
        '',
        'set -e',
        'cd "$(dirname "$0")"',
        '',
        'PORT="${PORT:-8000}"',
        '',
        '# Pick the first available server runtime',
        'if command -v python3 >/dev/null 2>&1; then',
        '  SERVER="python3 -m http.server $PORT"',
        'elif command -v python >/dev/null 2>&1; then',
        '  SERVER="python -m SimpleHTTPServer $PORT"',
        'elif command -v npx >/dev/null 2>&1; then',
        '  SERVER="npx --yes http-server -p $PORT -c-1"',
        'elif command -v php >/dev/null 2>&1; then',
        '  SERVER="php -S 0.0.0.0:$PORT"',
        'else',
        '  echo "No HTTP server runtime found."',
        '  echo "Install Python 3 from https://python.org and try again."',
        '  exit 1',
        'fi',
        '',
        '# Detect LAN IP',
        'IP=""',
        'if command -v ip >/dev/null 2>&1; then',
        '  IP=$(ip -4 route get 8.8.8.8 2>/dev/null | awk "{print \$7; exit}" || true)',
        'fi',
        'if [ -z "$IP" ] && command -v hostname >/dev/null 2>&1; then',
        '  IP=$(hostname -I 2>/dev/null | awk "{print \$1}" || true)',
        'fi',
        'if [ -z "$IP" ]; then',
        '  IP="localhost"',
        'fi',
        '',
        'echo ""',
        'echo "  Atlas local server starting on port $PORT"',
        'echo "  Local:    http://localhost:$PORT/"',
        'if [ "$IP" != "localhost" ]; then',
        '  echo "  Network:  http://$IP:$PORT/"',
        '  echo ""',
        '  echo "  Visit the Network URL from any device on the same Wi-Fi."',
        'fi',
        'echo ""',
        '',
        '# Try to open the browser (best effort, ignore errors)',
        'if command -v xdg-open >/dev/null 2>&1; then',
        '  (sleep 1 && xdg-open "http://localhost:$PORT/' + entry + '") &',
        'elif command -v open >/dev/null 2>&1; then',
        '  (sleep 1 && open "http://localhost:$PORT/' + entry + '") &',
        'fi',
        '',
        'echo "  Press Ctrl+C to stop."',
        'echo ""',
        '',
        'exec $SERVER',
        '',
      ].join('\n');
      zip.file('start.sh', startSh);

      // start.bat — Windows
      const startBat = [
        '@echo off',
        'REM Atlas local server — generated by Atlas AI Chat',
        'REM Serves project files over HTTP for testing on other devices.',
        'REM Double-click this file to run.',
        '',
        'cd /d "%~dp0"',
        'set PORT=8000',
        '',
        'REM Detect LAN IP via PowerShell',
        'for /f "tokens=2 delims=:" %%a in (\'"ipconfig | findstr /R /C:"IPv4""\') do (',
        '  set LANIP=%%a',
        '  set LANIP=%LANIP: =%',
        ')',
        'if "%LANIP%"=="" set LANIP=localhost',
        '',
        'REM Pick the first available server runtime',
        'where python >nul 2>&1 && (',
        '  echo.',
        '  echo   Atlas local server starting on port %PORT%',
        '  echo   Local:    http://localhost:%PORT%/',
        '  if not "%LANIP%"=="localhost" echo   Network:  http://%LANIP%:%PORT%/',
        '  echo   Visit the Network URL from any device on the same Wi-Fi.',
        '  echo   Press Ctrl+C to stop.',
        '  echo.',
        '  start "" "http://localhost:%PORT%/' + entry + '"',
        '  python -m http.server %PORT%',
        '  goto :eof',
        ')',
        'where py >nul 2>&1 && (',
        '  echo.',
        '  echo   Atlas local server starting on port %PORT%',
        '  echo   Local:    http://localhost:%PORT%/',
        '  if not "%LANIP%"=="localhost" echo   Network:  http://%LANIP%:%PORT%/',
        '  echo   Press Ctrl+C to stop.',
        '  echo.',
        '  start "" "http://localhost:%PORT%/' + entry + '"',
        '  py -m http.server %PORT%',
        '  goto :eof',
        ')',
        'where npx >nul 2>&1 && (',
        '  echo.',
        '  echo   Atlas local server starting on port %PORT%',
        '  echo   Local:    http://localhost:%PORT%/',
        '  if not "%LANIP%"=="localhost" echo   Network:  http://%LANIP%:%PORT%/',
        '  echo   Press Ctrl+C to stop.',
        '  echo.',
        '  start "" "http://localhost:%PORT%/' + entry + '"',
        '  npx --yes http-server -p %PORT% -c-1',
        '  goto :eof',
        ')',
        '',
        'echo No HTTP server runtime found.',
        'echo Install Python 3 from https://python.org and try again.',
        'pause',
        '',
      ].join('\r\n');
      zip.file('start.bat', startBat);

      // README
      zip.file(
        'README.txt',
        'Atlas Local Server Bundle\n' +
        'Generated: ' + new Date().toString() + '\n' +
        'Entry point: ' + entry + '\n' +
        'Files: ' + _vfs.size + '\n\n' +
        'HOW TO START\n' +
        '------------\n' +
        'Mac / Linux:\n' +
        '  Double-click start.sh\n' +
        '  (or run: bash start.sh)\n\n' +
        'Windows:\n' +
        '  Double-click start.bat\n\n' +
        'The script starts an HTTP server on port 8000 and prints the URLs.\n' +
        'Other devices on the same Wi-Fi can visit the Network URL.\n\n' +
        'CHANGE PORT\n' +
        '-----------\n' +
        'Mac/Linux:  PORT=9000 bash start.sh\n' +
        'Windows:    edit start.bat and change set PORT=8000\n\n' +
        'Generated by Atlas — AI Chat'
      );

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().slice(0, 10);
      a.download = 'atlas-serve-' + ts + '.zip';
      a.click();
      URL.revokeObjectURL(url);

      // Show instructions modal
      _showServeModal(entry);

      if (typeof toast === 'function') {
        toast('🌐 Server bundle downloaded — extract and run start.sh / start.bat', 'ok');
      }
    } catch (e) {
      console.error('[AgentMode] serve bundle failed:', e);
      if (typeof toast === 'function') {
        toast('Failed to generate server bundle: ' + e.message, 'er');
      }
    }
  }

  // ── Serve instructions modal ───────────────────────────────────────────
  // Pops up after the user clicks Serve Locally, explaining what to do with
  // the downloaded zip. Modeled on z.ai's clean modal style — centered
  // overlay, single column of steps, dismissable by clicking outside.
  function _showServeModal(entry) {
    // Remove any existing modal first
    const existing = document.getElementById('agent-serve-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'agent-serve-modal';
    modal.className = 'agent-serve-modal';
    modal.innerHTML = `
      <div class="agent-serve-card">
        <div class="agent-serve-hdr">
          <span class="agent-serve-icon">🌐</span>
          <div>
            <div class="agent-serve-title">Local Server Bundle</div>
            <div class="agent-serve-sub">Test on any device on the same Wi-Fi</div>
          </div>
          <button class="agent-serve-close" onclick="document.getElementById('agent-serve-modal').remove()">✕</button>
        </div>
        <div class="agent-serve-body">
          <div class="agent-serve-step">
            <div class="agent-serve-num">1</div>
            <div>
              <div class="agent-serve-step-title">Locate the downloaded zip</div>
              <div class="agent-serve-step-sub">Check your browser's download bar.</div>
            </div>
          </div>
          <div class="agent-serve-step">
            <div class="agent-serve-num">2</div>
            <div>
              <div class="agent-serve-step-title">Extract it</div>
              <div class="agent-serve-step-sub">Double-click the zip, or run <code>unzip atlas-serve-*.zip</code></div>
            </div>
          </div>
          <div class="agent-serve-step">
            <div class="agent-serve-num">3</div>
            <div>
              <div class="agent-serve-step-title">Run the start script</div>
              <div class="agent-serve-step-sub">
                <strong>Mac/Linux:</strong> double-click <code>start.sh</code> or run <code>bash start.sh</code><br>
                <strong>Windows:</strong> double-click <code>start.bat</code>
              </div>
            </div>
          </div>
          <div class="agent-serve-step">
            <div class="agent-serve-num">4</div>
            <div>
              <div class="agent-serve-step-title">Open on other devices</div>
              <div class="agent-serve-step-sub">
                The terminal prints a Network URL like <code>http://192.168.x.x:8000/</code>.
                Visit it from your phone, tablet, or another computer on the same Wi-Fi.
              </div>
            </div>
          </div>
        </div>
        <div class="agent-serve-note">
          <strong>Entry point:</strong> <code>${entry}</code> · <strong>Port:</strong> 8000 (override with <code>PORT=9000 bash start.sh</code>)
        </div>
        <div class="agent-serve-actions">
          <button class="agent-serve-btn" onclick="document.getElementById('agent-serve-modal').remove()">Got it</button>
        </div>
      </div>
    `;
    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
  }

  // ── Clear all files ────────────────────────────────────────────────────
  function _clearFiles() {
    _vfs.clear();
    _renderTree();
    if (typeof toast === 'function') toast('Cleared all files', 'ok');
  }

  // ── Preview Website ────────────────────────────────────────────────────
  // One-click "open the full multi-file website in the artifact panel" button.
  // Finds the entry-point HTML file in the VFS and opens it as a project
  // (which inlines CSS/JS into the iframe so the site renders correctly).
  //
  // Entry-point priority:
  //   1. `index.html` at the root of the VFS
  //   2. Any `index.html` (in a subfolder)
  //   3. Any `.html` file at the root
  //   4. Any `.html` file anywhere
  //
  // If there's only ONE file and it's HTML, open it as a project too (the
  // composite is just the file itself, which is fine).
  // If there's NO html file at all, toast an error.
  function _previewWebsite() {
    if (_vfs.size === 0) {
      if (typeof toast === 'function') toast('No files to preview — extract some first', 'er');
      return;
    }
    const allPaths = Array.from(_vfs.keys());
    const rootIndex = allPaths.find(p => p === 'index.html');
    const anyIndex = allPaths.find(p => p.endsWith('/index.html') || p === 'index.html');
    const rootHtml = allPaths.find(p => /^[^/]+\.html?$/i.test(p));
    const anyHtml = allPaths.find(p => /\.html?$/i.test(p));
    const entry = rootIndex || anyIndex || rootHtml || anyHtml;
    if (!entry) {
      if (typeof toast === 'function') toast('No HTML file found in the project', 'er');
      return;
    }
    _openProject(entry);
  }

  // ── Toggle / state ─────────────────────────────────────────────────────
  function _setActive(on) {
    _active = !!on;
    // Update sidebar bar
    const bar = document.getElementById('agent-bar');
    const sub = document.getElementById('agent-bar-sub');
    if (bar) bar.classList.toggle('active', _active);
    if (sub) sub.textContent = _active ? 'On — extracting files' : 'Off — chat normally';
    // Update input-zone button
    const btn = document.getElementById('agent-btn');
    if (btn) btn.classList.toggle('active', _active);
    // Show/hide the files panel (only if there are files OR mode is on with empty state)
    const panel = document.getElementById('agent-files-panel');
    if (panel) panel.style.display = (_active && _vfs.size > 0) ? 'flex' : (_active ? 'flex' : 'none');
    if (_active) _renderTree();
    // Update placeholder
    const inp = document.getElementById('user-input');
    if (inp) inp.placeholder = _active ? 'Describe what to build — Atlas will extract files…' : 'Message Atlas…';
    // Persist via the global S object if available (so the toggle survives reloads)
    try {
      if (typeof S !== 'undefined' && S.cfg) {
        S.cfg.agentMode = _active;
        if (typeof persist === 'function') persist();
      }
    } catch (e) { /* ignore */ }
  }

  function _toggle() {
    _setActive(!_active);
    if (typeof toast === 'function') {
      toast(_active ? '🤖 Agent Mode ON — files will be extracted to the sidebar' : '💬 Agent Mode OFF', 'ok');
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────
  // We attach to window so atlas.js (which is not a module) can call us.
  // The names _agentExtractFiles, _agentProcessResponse, _agentPreviewFile,
  // _agentClearFiles, _agentDownloadAll, and toggleAgentMode are referenced
  // in the investigation log — we expose them as aliases for backward
  // compatibility with any leftover references in atlas.js.
  window.AgentMode = {
    isActive:   () => _active,
    setActive:  _setActive,
    toggle:     _toggle,
    processResponse: _extractFiles,
    renderTree: _renderTree,
    clearFiles: _clearFiles,
    previewWebsite: _previewWebsite,
    getSystemPrompt: () => AGENT_PROMPT,
    getUserPrefix:   () => USER_PREFIX,
    openFile:   _openFile,
    openProject: _openProject,
    buildWebsitePreview: _buildWebsitePreview,
    serveLocally: _serveLocally,
    downloadAll: _downloadAll,
    // Aliases for the names used in the investigation log
    _agentExtractFiles:  _extractFiles,
    _agentProcessResponse: _extractFiles, // semantic alias: process the response → returns count
    _agentPreviewFile:   _openFile,
    _agentClearFiles:    _clearFiles,
    _agentDownloadAll:   _downloadAll,
    _agentServeLocally:  _serveLocally,
    _agentPreviewWebsite: _previewWebsite,
    _agentVfs:           _vfs, // exposed for debugging only
  };

  // Also expose the standalone function names atlas.js expects to call
  // directly (toggleAgentMode, _agentProcessResponse, etc.) so existing
  // inline onclick handlers and code paths keep working.
  window.toggleAgentMode     = _toggle;
  window._agentProcessResponse = _extractFiles;
  window._agentExtractFiles  = _extractFiles;
  window._agentPreviewFile   = _openFile;
  window._agentClearFiles    = function(e) { if (e && e.stopPropagation) e.stopPropagation(); _clearFiles(); };
  window._agentDownloadAll   = _downloadAll;
  window._agentServeLocally  = _serveLocally;
  window._agentPreviewWebsite = _previewWebsite;
  window._agentRenderTree    = _renderTree;

  // Restore saved state on load
  // We can't read S.cfg here because atlas.js may not have loaded yet —
  // instead, atlas.js calls AgentMode.setActive() from _init() if needed.
  // Default: OFF. Safer than auto-on (user might not expect extraction).
})();
