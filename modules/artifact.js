/**
 * Atlas — Artifact Document System (Claude-style)
 * File: modules/artifact.js
 *
 * A Claude.ai-inspired artifact pipeline for Atlas:
 *   1. A system-prompt protocol instructs the model to wrap substantial,
 *      self-contained content in <artifact identifier="…" type="…" title="…">
 *      tags. Supported types mirror Claude's set:
 *        text/markdown · text/html · image/svg+xml ·
 *        application/vnd.ant.mermaid · application/vnd.ant.code
 *   2. An incremental stream parser detects the tags mid-stream, strips the
 *      body from the chat display (replaced by a compact card token
 *      [[ARTIFACT:id]]) and streams the content LIVE into the artifact panel.
 *   3. Every emission for the same identifier pushes a new VERSION
 *      (v1 → v2 → v3 …) with a version-history dropdown in the panel header.
 *   4. Records persist per conversation (IndexedDB via ChatStorage) and are
 *      restored when the chat is reopened — cards re-materialize from the
 *      tokens stored in the message content.
 *   5. Documents render in a styled reading view with a floating
 *      "✨ Edit with Claude" button that appears when text is selected;
 *      panel edits and exports integrate with Atlas's office-level editors
 *      (Word visual editor, jsPDF / docx.js generators).
 *
 * Load order: modules/utils.js → modules/agent.js → modules/artifact.js → atlas.js
 * This file defines window.ArtifactDoc and never touches the DOM at load time.
 */
(function () {
  'use strict';

  // ── Helpers ─────────────────────────────────────────────────────────────
  // esc() comes from modules/utils.js (loaded first). Guard anyway for tests.
  function E(s) {
    if (typeof esc === 'function') return esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function gs() { return (typeof S !== 'undefined') ? S : null; }

  const KIND_META = {
    doc:     { icon: '📄', label: 'Document' },
    html:    { icon: '🧩', label: 'HTML page' },
    svg:     { icon: '🖼️', label: 'SVG graphic' },
    mermaid: { icon: '📊', label: 'Mermaid diagram' },
    code:    { icon: '💻', label: 'Code' },
  };

  const TOKEN_PRE = '[[ARTIFACT:';
  const TOKEN_POST = ']]';
  const TOKEN_RE = /\[\[ARTIFACT:([A-Za-z0-9_.-]+)\]\]/g;
  const OPEN_RE  = /<(?:antml:)?artifact\b([^>]*)>/i;
  const CLOSE_RE = /<\/(?:antml:)?artifact\s*>/i;

  const MAX_VERSIONS = 40;        // hard cap per artifact
  const CTX_CAP = 36000;          // chars of artifact content injected as context

  // ── System prompt (Claude artifacts_info, adapted for Atlas) ────────────
  const ART_SYSTEM_PROMPT = [
    'ARTIFACT DOCUMENT SYSTEM',
    'You can create artifacts — substantial, self-contained content that opens in a panel beside the chat, where the user can read, edit, version, export, and iterate on it with you.',
    '',
    'CREATE an artifact for:',
    '- Documents the user will keep, share, or reuse: reports, briefs, articles, essays, guides, plans, documentation, READMEs (roughly >15 lines)',
    '- Single-file interactive HTML pages: tools, calculators, quizzes, games, dashboards',
    '- Standalone SVG graphics and Mermaid diagrams',
    '- Complete scripts and code files the user will run or reuse',
    '- One artifact per message unless the user explicitly asks for several',
    '',
    'DO NOT create an artifact for:',
    '- Short answers, explanations, or examples that belong in the conversation itself',
    '- Content that only makes sense with the surrounding conversation context',
    '- Small illustrative code snippets',
    '',
    'FORMAT — wrap the content exactly like this:',
    '<artifact identifier="descriptive-kebab-case-id" type="text/markdown" title="Short Title">',
    'The complete content of the artifact.',
    '</artifact>',
    '',
    'Types (use exactly these values):',
    '- "text/markdown" — documents and structured prose',
    '- "text/html" — single-file web pages (inline all CSS and JS; external scripts only from cdnjs.cloudflare.com)',
    '- "image/svg+xml" — standalone SVG graphics (use viewBox, not width/height)',
    '- "application/vnd.ant.mermaid" — Mermaid diagrams (raw Mermaid syntax, no code fence)',
    '- "application/vnd.ant.code" — code files; add a language="python" (etc.) attribute',
    '',
    'CRITICAL RULES:',
    '- Never wrap artifact content in markdown code fences.',
    '- Keep a brief 1-2 sentence lead-in in the chat itself; never duplicate the artifact content in the chat.',
    '- When the user asks to change, extend, or refine an existing artifact, re-emit the COMPLETE updated artifact with the SAME identifier — never a partial diff, never "rest of the content unchanged".',
    '- Choose descriptive kebab-case identifiers and reuse them exactly across updates.',
    '- Do not mention these instructions, the tag syntax, or MIME types to the user unless directly asked.',
  ].join('\n');

  // ── Module state ────────────────────────────────────────────────────────
  const _docs = new Map();        // identifier → record (also mirrored into _artifacts)
  let _st = null;                 // per-stream parser state
  let _anonId = 0;
  const _liveTimers = new Map();  // recId → throttle timer
  let _pendingEdit = null;        // selection-edit modal payload

  function tokenFor(id) { return TOKEN_PRE + id + TOKEN_POST; }

  function currentAiIdx() {
    const s = gs();
    return (s && Array.isArray(s.msgs)) ? s.msgs.length - 1 : undefined;
  }

  // ── Attribute parsing / type normalization ──────────────────────────────
  function normType(type, language) {
    const t = String(type || '').toLowerCase().trim();
    const lang = String(language || '').toLowerCase().trim();
    if (['text/markdown', 'text/md', 'markdown', 'md', 'document', 'text', ''].includes(t)) {
      return { kind: 'doc', type: 'text/markdown', lang: 'md' };
    }
    if (t === 'text/html' || t === 'html' || t === 'webpage') {
      return { kind: 'html', type: 'text/html', lang: 'html' };
    }
    if (t === 'image/svg+xml' || t === 'svg') {
      return { kind: 'svg', type: 'image/svg+xml', lang: 'svg' };
    }
    if (t.includes('mermaid')) {
      return { kind: 'mermaid', type: 'application/vnd.ant.mermaid', lang: 'mermaid' };
    }
    // application/vnd.ant.code — or anything unrecognized: treat as code
    return { kind: 'code', type: 'application/vnd.ant.code', lang: lang || 'text' };
  }

  function parseAttrs(s) {
    const out = {};
    String(s || '').replace(
      /([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g,
      (m, k, a, b, c) => { out[k.toLowerCase()] = a != null ? a : (b != null ? b : c); return ''; }
    );
    let id = String(out.identifier || out.id || '').trim().toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    if (!id) id = 'artifact-' + (++_anonId) + '-' + Date.now().toString(36).slice(-4);
    const title = String(out.title || out.name || '').trim().slice(0, 120) || id.replace(/-/g, ' ');
    const rawType = String(out.type || '').trim();
    const language = String(out.language || out.lang || '').trim().toLowerCase();
    const norm = normType(rawType, language);
    return { id, title, rawType, type: norm.type, kind: norm.kind, lang: norm.lang };
  }

  // ── Record store ────────────────────────────────────────────────────────
  // record: { id, kind, type, lang, title, versions:[{content,ts,finalized,msgIdx,origin}],
  //           activeVersion, code, srcMsgIdx, _doc:true }
  function _ensureRec(meta) {
    let rec = _docs.get(meta.id);
    if (!rec) {
      rec = {
        id: meta.id, kind: meta.kind, type: meta.type, lang: meta.lang,
        title: meta.title || meta.id, versions: [], activeVersion: 0,
        code: '', srcMsgIdx: currentAiIdx(), _doc: true,
      };
      _docs.set(meta.id, rec);
      // Mirror into the panel's tab array so preview/export machinery works.
      try {
        if (typeof _artifacts !== 'undefined' && Array.isArray(_artifacts)) _artifacts.push(rec);
      } catch (_) {}
    } else {
      if (meta.title) rec.title = meta.title;
      if (meta.type) rec.type = meta.type;
      if (meta.kind) rec.kind = meta.kind;
      if (meta.lang) rec.lang = meta.lang;
    }
    return rec;
  }

  function _syncCode(rec) {
    const v = rec.versions[rec.activeVersion];
    rec.code = v ? v.content : (rec.versions.length ? rec.versions[rec.versions.length - 1].content : '');
  }

  function _collapseDup(rec) {
    const vs = rec.versions;
    if (vs.length >= 2) {
      const a = vs[vs.length - 2], b = vs[vs.length - 1];
      if (a.finalized && b.finalized && a.content === b.content) {
        vs.splice(vs.length - 2, 1);
        rec.activeVersion = Math.max(0, Math.min(rec.activeVersion, vs.length - 1));
      }
    }
  }

  // ── Incremental stream parser ───────────────────────────────────────────
  // State survives across a single assistant turn INCLUDING auto-continuations
  // (_doContinue appends to the same raw string, so a document truncated
  // mid-artifact resumes seamlessly). beginStream() resets per user message.
  function beginStream() {
    _st = { scanPos: 0, raw: '', cleanText: '', rawBakedEnd: 0, open: null, emissions: [] };
  }

  // A trailing unterminated '<…' fragment is stripped only when it could be
  // the prefix of an artifact tag (so prose like "a < b" is untouched).
  function _stripPartialTag(tail) {
    const m = /<[^>]*$/.exec(tail);
    if (!m) return tail;
    const frag = m[0].toLowerCase();
    const cands = ['<artifact', '</artifact', '<antml:artifact', '</antml:artifact'];
    for (const c of cands) {
      if (frag.startsWith(c) || c.startsWith(frag)) return tail.slice(0, m.index);
    }
    return tail;
  }

  function _partialTagStart(full) {
    const look = full.slice(-512);
    const m = /<[^>]*$/.exec(look);
    if (!m) return -1;
    const frag = m[0].toLowerCase();
    const cands = ['<artifact', '</artifact', '<antml:artifact', '</antml:artifact'];
    for (const c of cands) {
      if (frag.startsWith(c) || c.startsWith(frag)) return full.length - look.length + m.index;
    }
    return -1;
  }

  function ingest(full) {
    if (typeof full !== 'string' || !full) return;
    if (!_st) beginStream();
    _st.raw = full;
    let guard = 0;
    while (guard++ < 64) {
      if (_st.open) {
        const rest = full.slice(_st.open.contentStart);
        const m = CLOSE_RE.exec(rest);
        if (m) {
          const closeAbs = _st.open.contentStart + m.index;
          const closeEnd = closeAbs + m[0].length;
          // Swallow a closing code fence if the model fenced the whole artifact
          let spanEnd = closeEnd;
          const after = full.slice(closeEnd, closeEnd + 12);
          const fm = /^\s*```[^\n]*\n?/.exec(after);
          if (fm) spanEnd = closeEnd + fm[0].length;
          _st.open.content = full.slice(_st.open.contentStart, closeAbs);
          _onEmissionClose(_st.open);
          _st.scanPos = spanEnd;
          _st.rawBakedEnd = spanEnd;
          _st.open = null;
          continue;
        }
        // Still open — live-update the in-flight content
        const content = full.slice(_st.open.contentStart);
        if (content !== _st.open.content) {
          _st.open.content = content;
          _onContentUpdate(_st.open);
        }
        return;
      }
      // No open emission → scan for the next opening tag
      const rest = full.slice(_st.scanPos);
      const m = OPEN_RE.exec(rest);
      if (!m) {
        // Advance the scan window — but never past a partially-streamed
        // artifact tag (its attributes may keep arriving for many chunks).
        let adv = full.length - 48;
        const pts = _partialTagStart(full);
        if (pts >= 0) adv = Math.min(adv, pts);
        _st.scanPos = Math.max(_st.scanPos, Math.max(0, Math.min(adv, full.length)));
        return;
      }
      const openAbs = _st.scanPos + m.index;
      const openEnd = openAbs + m[0].length;
      const meta = parseAttrs(m[1]);
      // Swallow an opening code fence if present
      let spanStart = openAbs;
      const before = full.slice(Math.max(0, openAbs - 40), openAbs);
      const fb = /```[\w-]*[ \t]*\n[ \t]*$/.exec(before);
      if (fb) spanStart = openAbs - fb[0].length;
      const em = { meta, spanStart, contentStart: openEnd, content: '', closed: false };
      _st.emissions.push(em);
      _st.open = em;
      // Bake the chat token: raw text before the span + token
      _st.cleanText += full.slice(_st.rawBakedEnd, spanStart) + tokenFor(meta.id);
      _st.rawBakedEnd = spanStart;
      _st.scanPos = openEnd;
      _onEmissionStart(em);
    }
  }

  // Chat display string: artifact spans replaced by [[ARTIFACT:id]] tokens.
  // Also ingests, so call sites only need this one function during streaming.
  function cleanForChat(full) {
    if (typeof full !== 'string' || !full) return full || '';
    try { ingest(full); } catch (_) {}
    if (!_st) return full;
    if (_st.open) return _st.cleanText;      // open span covers everything to EOF
    // Everything after the last baked position is plain chat text — minus any
    // partially-streamed opening tag that would otherwise flash raw.
    return _st.cleanText + _stripPartialTag(full.slice(_st.rawBakedEnd));
  }

  // Post-stream: compute the final clean text. Does NOT close open emissions —
  // an auto-continuation may still extend the document (state is kept).
  function finalizeStream(full) {
    try { ingest(full); } catch (_) {}
    if (!_st) return typeof full === 'string' ? full : '';
    return cleanForChat(_st.raw || full);
  }

  // Abort rescue: partial text that was streamed before the user hit Stop.
  function finalizePartial() {
    if (!_st || !_st.raw) return null;
    try {
      const clean = cleanForChat(_st.raw);
      if (!clean || !clean.trim()) return null;
      return clean;
    } catch (_) { return null; }
  }

  // ── Emission lifecycle → versioned store ────────────────────────────────
  function _onEmissionStart(em) {
    const rec = _ensureRec(em.meta);
    const msgIdx = currentAiIdx();
    rec.srcMsgIdx = msgIdx;
    const last = rec.versions[rec.versions.length - 1];
    em.version = null;
    if (last && !last.finalized) {
      if (last.msgIdx === msgIdx) {
        em.version = last;              // defensive: re-parse of the same emission
      } else {
        last.finalized = true;          // truncated previous message — close it out
      }
    }
    if (!em.version) {
      em.version = { content: '', ts: Date.now(), msgIdx, finalized: false };
      rec.versions.push(em.version);
      if (rec.versions.length > MAX_VERSIONS) rec.versions.splice(0, rec.versions.length - MAX_VERSIONS);
    }
    rec.activeVersion = rec.versions.indexOf(em.version);
    em.rec = rec;
    // Focus the panel on this artifact (Claude opens/switches on emission).
    // Records restored from a saved conversation are re-materialized as tabs.
    try {
      if (typeof _artifacts !== 'undefined' && Array.isArray(_artifacts) && typeof activateArtifact === 'function') {
        let idx = _artifacts.indexOf(rec);
        if (idx < 0) { _artifacts.push(rec); idx = _artifacts.length - 1; }
        activateArtifact(idx);
      }
    } catch (_) {}
    _liveRenderNow(rec);
  }

  function _onContentUpdate(em) {
    if (!em.version || !em.rec) return;
    em.version.content = em.content;
    em.rec.code = em.content;
    _schedLive(em.rec);
  }

  function _onEmissionClose(em) {
    if (em.version) { em.version.content = em.content; em.version.finalized = true; }
    if (em.rec) {
      em.rec.code = em.content;
      _collapseDup(em.rec);
      _liveRenderNow(em.rec);
    }
  }

  // Rescue path: raw <artifact> spans found while re-rendering a saved message
  // (e.g. the stream was aborted before finalization). Idempotent per id —
  // the persisted store always wins over re-parsed message text.
  function rescueRegister(meta, content) {
    if (_docs.has(meta.id)) return;
    const rec = _ensureRec(meta);
    rec.versions.push({ content: content, ts: Date.now(), finalized: true, msgIdx: undefined, origin: 'rescue' });
    rec.activeVersion = rec.versions.length - 1;
    _syncCode(rec);
  }

  // ── Markdown → HTML mini renderer ───────────────────────────────────────
  // Self-contained: does NOT touch codeStore (unlike atlas.js renderMarkdown),
  // so it is safe for card previews and the document iframe. Everything is
  // escaped first; inline HTML in the source is neutralized.
  function mdToHtml(md, opts) {
    opts = opts || {};
    if (!md || !String(md).trim()) return '<p class="md-empty">The document is empty.</p>';
    const fences = [];
    let t = String(md).replace(/```([\w-]*)[ \t]*\n?([\s\S]*?)(?:```|$)/g, (m, lang, code) => {
      fences.push('<pre class="md-pre">' + E(code.replace(/\s+$/, '')) +
        (lang ? '<span class="md-pre-lang">' + E(String(lang).toLowerCase()) + '</span>' : '') + '</pre>');
      return '\u0001F' + (fences.length - 1) + '\u0001';
    });
    t = E(t);
    const out = [];
    let para = [], list = null, tbl = null;
    const inline = (s) => s
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\u0001F(\d+)\u0001/g, (mm, i) => fences[+i] || '');
    const flushP = () => { if (para.length) { out.push('<p>' + para.join('<br>') + '</p>'); para = []; } };
    const flushL = () => { if (list) { out.push('<' + list.tag + '>' + list.items.map(i => '<li>' + i + '</li>').join('') + '</' + list.tag + '>'); list = null; } };
    const flushT = () => {
      if (tbl && tbl.rows.length) {
        const head = tbl.rows[0];
        out.push('<table><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' +
          tbl.rows.slice(1).map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
      }
      tbl = null;
    };
    const flushAll = () => { flushP(); flushL(); flushT(); };
    for (const line of t.split('\n')) {
      let m;
      const fenceOnly = line.trim().match(/^\u0001F(\d+)\u0001$/);
      if (fenceOnly) { flushAll(); out.push(fences[+fenceOnly[1]] || ''); continue; }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { flushAll(); const lv = Math.min(4, m[1].length); out.push('<h' + lv + '>' + inline(m[2].trim()) + '</h' + lv + '>'); continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushAll(); out.push('<hr>'); continue; }
      if ((m = /^\s*&gt;\s?(.*)$/.exec(line))) { flushAll(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); continue; }
      if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) { flushP(); flushT(); if (!list || list.tag !== 'ul') { flushL(); list = { tag: 'ul', items: [] }; } list.items.push(inline(m[1])); continue; }
      if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) { flushP(); flushT(); if (!list || list.tag !== 'ol') { flushL(); list = { tag: 'ol', items: [] }; } list.items.push(inline(m[1])); continue; }
      if (/^\s*\|.*\|\s*$/.test(line)) {
        flushP(); flushL();
        const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        if (/^[\s\-:|]+$/.test(line.trim())) continue;         // separator row
        if (!tbl) tbl = { rows: [] };
        tbl.rows.push(cells);
        continue;
      }
      if (!line.trim()) { flushAll(); continue; }
      if (tbl) flushT();
      if (list) flushL();
      para.push(inline(line));
    }
    flushAll();
    return out.join('\n');
  }

  // ── Document view (text/markdown artifacts) ─────────────────────────────
  function _isLight() { const s = gs(); return !!(s && s.theme === 'light'); }

  function docCss(light) {
    const bg = light ? '#ffffff' : '#131318';
    const fg = light ? '#1c1c22' : '#e6e6f0';
    const mut = light ? '#6a6a78' : '#9a9ab0';
    const acc = light ? '#5b4bc4' : '#8f7cff';
    const codeBg = light ? 'rgba(90,80,180,.07)' : 'rgba(140,130,255,.09)';
    const bdr = light ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.1)';
    return `
      html,body{margin:0;padding:0;background:${bg};color:${fg};
        font:15.5px/1.75 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,'DM Sans',sans-serif;
        -webkit-font-smoothing:antialiased}
      .paper{max-width:760px;margin:0 auto;padding:44px 36px 90px}
      .doc-head{margin-bottom:30px}
      .doc-title{font-size:29px;font-weight:700;line-height:1.25;letter-spacing:-.02em;margin:0 0 6px}
      .doc-sub{font-size:11.5px;color:${mut};text-transform:uppercase;letter-spacing:.08em}
      #doc-content h1{font-size:26px;font-weight:700;margin:34px 0 12px;line-height:1.3}
      #doc-content h2{font-size:21px;font-weight:700;margin:30px 0 10px;padding-bottom:6px;border-bottom:1px solid ${bdr}}
      #doc-content h3{font-size:17px;font-weight:650;margin:24px 0 8px}
      #doc-content h4{font-size:15px;font-weight:650;margin:20px 0 6px;color:${mut}}
      #doc-content p{margin:10px 0}
      #doc-content a{color:${acc};text-decoration:none;border-bottom:1px solid ${acc}44}
      #doc-content ul,#doc-content ol{margin:10px 0;padding-left:24px}
      #doc-content li{margin:5px 0}
      #doc-content blockquote{margin:14px 0;padding:6px 16px;border-left:3px solid ${acc};
        color:${mut};background:${codeBg};border-radius:0 8px 8px 0}
      #doc-content code{background:${codeBg};padding:2px 6px;border-radius:5px;
        font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:.86em}
      #doc-content hr{border:none;border-top:1px solid ${bdr};margin:26px 0}
      .md-pre{position:relative;margin:14px 0;padding:14px 16px;background:${light ? '#f4f4f8' : '#0d0d13'};
        border:1px solid ${bdr};border-radius:10px;overflow-x:auto;white-space:pre;
        font:12.5px/1.65 'DM Mono',ui-monospace,Menlo,monospace}
      .md-pre-lang{position:absolute;top:6px;right:10px;font-size:10px;color:${mut};letter-spacing:.05em}
      #doc-content table{border-collapse:collapse;margin:14px 0;width:100%;font-size:.93em}
      #doc-content th,#doc-content td{border:1px solid ${bdr};padding:7px 11px;text-align:left}
      #doc-content th{background:${codeBg};font-weight:650}
      .md-empty{color:${mut};font-style:italic}
      #atlas-edit-fab{position:absolute;display:none;padding:7px 13px;border:none;border-radius:999px;
        background:linear-gradient(135deg,#7c6aff,#a48cff);color:#fff;font-size:12px;font-weight:600;
        font-family:inherit;box-shadow:0 4px 16px rgba(0,0,0,.35);cursor:pointer;z-index:999}
      #atlas-edit-fab:hover{filter:brightness(1.1)}
      @media (max-width:600px){.paper{padding:26px 18px 70px}.doc-title{font-size:23px}}
    `;
  }

  function editFabJs(idJson, titleJson) {
    return `<script>
(function(){
  var fab = document.getElementById('atlas-edit-fab'); if (!fab) return;
  function hide(){ fab.style.display = 'none'; }
  function ctxOf(node){
    var p = node;
    while (p && p.nodeType === 3) p = p.parentNode;
    p = (p && p.closest) ? p.closest('p,h1,h2,h3,h4,li,blockquote,pre,td') : null;
    return p ? p.textContent.trim().slice(0, 220) : '';
  }
  function check(){
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || !sel.rangeCount) return hide();
    var txt = sel.toString();
    if (!txt || txt.length < 3) return hide();
    var r = sel.getRangeAt(0).getBoundingClientRect();
    if (!r || (!r.width && !r.height)) return hide();
    fab.style.display = 'block';
    fab.style.top = (window.scrollY + Math.max(10, r.top - 46)) + 'px';
    fab.style.left = (window.scrollX + Math.max(10, r.left)) + 'px';
    fab._t = txt.slice(0, 800);
    fab._c = ctxOf(sel.anchorNode);
  }
  document.addEventListener('mouseup', function(e){ if (fab.contains(e.target)) return; setTimeout(check, 12); });
  document.addEventListener('keyup', function(){ setTimeout(check, 12); });
  fab.addEventListener('click', function(){
    try { parent.postMessage({ type: 'atlas-art-edit', id: ${idJson}, title: ${titleJson}, sel: fab._t, ctx: fab._c }, '*'); } catch(_) {}
    hide();
  });
  window.__setDoc = function(html){ var el = document.getElementById('doc-content'); if (el) el.innerHTML = html; };
})();
<\/script>`;
  }

  function buildDocHtml(rec, opts) {
    opts = opts || {};
    const light = _isLight();
    const body = mdToHtml(rec.code || '', { full: true });
    const vN = (rec.versions || []).length || 1;
    const ts = (rec.versions && rec.versions[rec.activeVersion] && rec.versions[rec.activeVersion].ts) || Date.now();
    // JSON-encode for the inline script context, neutralizing '<' so a title
    // containing '</script>' can't terminate the iframe's script block early.
    const jsStr = (v) => JSON.stringify(String(v)).replace(/</g, '\\u003c');
    const idJson = jsStr(rec.id);
    const titleJson = jsStr(rec.title || rec.id);
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${docCss(light)}</style></head>
<body class="${light ? 'light' : 'dark'}">
<div class="paper">
  <div class="doc-head">
    <div class="doc-title">${E(rec.title || rec.id)}</div>
    <div class="doc-sub">Version ${vN} · ${fmtAgo(ts)} · Atlas document</div>
  </div>
  <div id="doc-content">${body}</div>
</div>
${opts.standalone ? '' : `<button id="atlas-edit-fab" type="button">✨ Edit with Claude</button>` + editFabJs(idJson, titleJson)}
</body></html>`;
  }

  // ── Mermaid view ────────────────────────────────────────────────────────
  function buildMermaidHtml(rec) {
    const light = _isLight();
    const theme = light ? 'default' : 'dark';
    const code = (rec.code || '').trim() || 'graph TD\nA[Waiting for diagram…]';
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%;background:${light ? '#ffffff' : '#0d0d12'}}
  #stage{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}
  .mermaid{font-family:'DM Sans',system-ui,sans-serif}
  #merr{display:none;margin:0;padding:18px;color:#ff5f6d;font-family:'DM Mono',monospace;
    font-size:12px;white-space:pre-wrap;max-width:88vw}
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"><\/script>
</head><body>
<div id="stage"><pre class="mermaid">${E(code)}</pre></div>
<pre id="merr"></pre>
<script>
(function(){
  var pending = null;
  function render(){
    var el = document.querySelector('.mermaid');
    if (!el || !window.mermaid) return;
    var err = document.getElementById('merr');
    var src = el.textContent;
    el.removeAttribute('data-processed');
    Promise.resolve().then(function(){ return window.mermaid.parse(src); }).then(function(){
      err.style.display = 'none'; el.style.display = '';
      return window.mermaid.run({ nodes: [el] });
    }).catch(function(e){
      el.style.display = 'none';
      err.textContent = '⚠ Could not render diagram:\\n' + ((e && (e.str || e.message)) || e) +
        '\\n\\nTip: ask Claude to fix the syntax.';
      err.style.display = 'block';
    });
  }
  window.__setMermaid = function(code2){
    var el = document.querySelector('.mermaid');
    if (el) el.textContent = code2;
    if (pending) return;
    pending = setTimeout(function(){ pending = null; render(); }, 400);
  };
  if (window.mermaid) {
    try { window.mermaid.initialize({ startOnLoad: false, theme: ${JSON.stringify(theme)}, securityLevel: 'loose' }); } catch (_) {}
    render();
  }
})();
<\/script></body></html>`;
  }

  function svgWrap(code) {
    const light = _isLight();
    return `<!DOCTYPE html><html><body style="margin:0;background:${light ? '#fafafa' : '#16161e'};display:flex;align-items:center;justify-content:center;min-height:100vh;overflow:auto">${code}</body></html>`;
  }

  // ── Panel frame dispatch ────────────────────────────────────────────────
  // Called from atlas.js loadArtFrame() for _doc artifacts. Returns true when
  // this module owns the frame; false falls through to the existing renderer
  // (svg / html / code kinds reuse Atlas's mature paths).
  function loadFrame(art) {
    if (!art || !art._doc) return false;
    const frame = document.getElementById('artifact-frame');
    if (!frame) return false;
    if (art.kind === 'doc')     { frame.srcdoc = buildDocHtml(art); return true; }
    if (art.kind === 'mermaid') { frame.srcdoc = buildMermaidHtml(art); return true; }
    return false;
  }

  // [NEW] Re-render the active doc/mermaid frame after a theme switch — the
  // frame HTML bakes in theme-aware colors, so it must be rebuilt when the
  // user toggles Dark/Light. Preserves the reader's scroll position.
  function rerenderActive() {
    try {
      const panel = document.getElementById('artifact-panel');
      if (!panel || !panel.classList.contains('open')) return;
      const frame = document.getElementById('artifact-frame');
      const arts = (typeof _artifacts !== 'undefined') ? _artifacts : [];
      const art = arts[(typeof _activeArt !== 'undefined') ? _activeArt : 0];
      if (!frame || !art || !art._doc) return;
      let sx = 0, sy = 0;
      try { sx = frame.contentWindow.scrollX || 0; sy = frame.contentWindow.scrollY || 0; } catch (_) {}
      if (loadFrame(art) && (sx || sy)) {
        frame.addEventListener('load', function _restoreScroll() {
          frame.removeEventListener('load', _restoreScroll);
          try { frame.contentWindow.scrollTo(sx, sy); } catch (_) {}
        });
      }
    } catch (_) {}
  }

  // ── Live render (throttled) ─────────────────────────────────────────────
  function _schedLive(rec) {
    if (!rec) return;
    const iv = { doc: 140, svg: 450, html: 700, mermaid: 900, code: 180 }[rec.kind] || 200;
    if (_liveTimers.has(rec.id)) return;
    _liveTimers.set(rec.id, setTimeout(() => { _liveTimers.delete(rec.id); _liveRender(rec); }, iv));
  }

  function _liveRenderNow(rec) {
    if (_liveTimers.has(rec.id)) { clearTimeout(_liveTimers.get(rec.id)); _liveTimers.delete(rec.id); }
    _liveRender(rec);
  }

  function _liveRender(rec) {
    try {
      if (!rec) return;
      const s = gs();
      const panel = document.getElementById('artifact-panel');
      const activeIdx = (typeof _activeArt !== 'undefined') ? _activeArt : 0;
      const isActive = (typeof _artifacts !== 'undefined') && _artifacts[activeIdx] === rec;
      const open = panel && panel.classList.contains('open');
      // Source pane is cheap — always keep it in sync
      const srcEl = document.getElementById('artifact-source');
      if (srcEl && rec.code) srcEl.textContent = rec.code;
      if (!open || !isActive) return;
      const frame = document.getElementById('artifact-frame');
      if (!frame) return;
      const streaming = !!(s && s.streaming);
      if (rec.kind === 'doc') {
        const cw = frame.contentWindow;
        if (cw && cw.__setDoc) {
          try { cw.__setDoc(mdToHtml(rec.code, { full: true })); } catch (_) {}
        } else {
          _schedLive(rec);   // frame still loading — retry on the next tick
        }
      } else if (rec.kind === 'mermaid') {
        const cw = frame.contentWindow;
        if (cw && cw.__setMermaid) {
          try { cw.__setMermaid(rec.code); } catch (_) {}
        } else {
          _schedLive(rec);   // mermaid script still loading — retry
        }
      } else if (rec.kind === 'svg') {
        if (streaming) frame.srcdoc = svgWrap(rec.code || '');
      } else if (rec.kind === 'html') {
        if (streaming) {
          let y = 0; try { y = frame.contentWindow ? (frame.contentWindow.scrollY || 0) : 0; } catch (_) {}
          const base = (typeof _wrapArtHtml === 'function') ? _wrapArtHtml(rec.code || '') : (rec.code || '');
          frame.srcdoc = base + '<script>window.scrollTo(0,' + y + ');<\/script>';
        }
      }
      // code kind: live text flows into the source pane; the runner iframe is
      // only spun up at emission close via loadArtFrame (avoids partial-code runs)
    } catch (_) {}
  }

  // ── Chat cards ──────────────────────────────────────────────────────────
  // renderMarkdown() extracts [[ARTIFACT:id]] tokens into placeholders before
  // escaping, then substitutes the card HTML back in (same pattern as code
  // blocks and math). Cards therefore survive full-chat re-renders.
  function extractCardTokens(text, out) {
    if (typeof text !== 'string') return text;
    const push = (id) => { out.push(id); return '\uE003AC' + (out.length - 1) + '\uE003'; };
    let t = text.replace(TOKEN_RE, (m, id) => push(id));
    // Rescue raw complete spans (aborted streams / legacy messages) — one-time
    // registration per id; the persisted store always wins on re-render.
    t = t.replace(/<(?:antml:)?artifact\b([^>]*)>([\s\S]*?)<\/(?:antml:)?artifact>/gi, (m, attrs, body) => {
      const meta = parseAttrs(attrs);
      try { rescueRegister(meta, body); } catch (_) {}
      return push(meta.id);
    });
    // Incomplete trailing span — strip from display (content is unreachable).
    // Two shapes: a fully-opened tag that never closed (strip tag + content),
    // and a tag still mid-word (strip the fragment).
    t = t.replace(/<(?:antml:)?artifact\b[^>]*(?:>[\s\S]*)?$/i, '');
    t = _stripPartialTag(t);
    return t;
  }

  function cardBodyId(id) { return 'acb-' + String(id).replace(/[^a-zA-Z0-9_-]/g, ''); }

  function renderCardHTML(id) {
    const rec = _docs.get(id);
    if (!rec) {
      return `<div class="art-card"><div class="art-card-main"><div class="art-card-emoji">📄</div>` +
        `<div class="art-card-info"><div class="art-card-title">Artifact</div>` +
        `<div class="art-card-meta">${E(id)} · not available in this conversation</div></div></div></div>`;
    }
    const meta = KIND_META[rec.kind] || KIND_META.doc;
    const lastV = rec.versions[rec.versions.length - 1] || {};
    const s = gs();
    const streaming = !!(s && s.streaming) && !lastV.finalized;
    const chars = (rec.code || '').length;
    const meta2 = streaming
      ? `writing… ${chars.toLocaleString()} chars`
      : `${meta.label} · v${rec.versions.length} · ${fmtAgo(lastV.ts || Date.now())}`;
    const expanded = !!rec._expanded;
    return `<div class="art-card k-${E(rec.kind)}${streaming ? ' streaming' : ''}" data-artid="${E(rec.id)}">` +
      `<div class="art-card-main" onclick="ArtifactDoc.openFromCard('${E(rec.id)}')">` +
      `<div class="art-card-emoji">${meta.icon}</div>` +
      `<div class="art-card-info"><div class="art-card-title">${E(rec.title)}</div>` +
      `<div class="art-card-meta">${E(meta2)}</div></div>` +
      `<div class="art-card-open">Open →</div></div>` +
      `<div class="art-card-body" id="${cardBodyId(rec.id)}" style="display:${expanded ? 'block' : 'none'}">${expanded ? mdToHtml(rec.code || '', { full: false }) : ''}</div>` +
      `<div class="art-card-toggle" onclick="ArtifactDoc.toggleCard('${E(rec.id)}', this)">${expanded ? '▴ Hide preview' : '▾ Preview in chat'}</div>` +
      `</div>`;
  }

  function toggleCard(id, btn) {
    const rec = _docs.get(id);
    const body = document.getElementById(cardBodyId(id));
    if (!rec || !body) return;
    const open = body.style.display !== 'none';
    rec._expanded = !open;   // survives streaming re-renders of the card
    body.style.display = open ? 'none' : 'block';
    if (!open) body.innerHTML = mdToHtml(rec.code || '', { full: false });
    if (btn) btn.textContent = open ? '▾ Preview in chat' : '▴ Hide preview';
  }

  function openFromCard(id) {
    const rec = _docs.get(id);
    if (!rec) return;
    try {
      if (typeof _artifacts === 'undefined' || typeof activateArtifact !== 'function') return;
      let idx = _artifacts.indexOf(rec);
      if (idx < 0) { _artifacts.push(rec); idx = _artifacts.length - 1; }
      activateArtifact(idx);
    } catch (_) {}
  }

  // History sent to the model: tokens become short references (the current
  // content rides in the system prompt via buildArtifactContextInjection).
  function historyize(content) {
    return String(content || '').replace(TOKEN_RE, (m, id) => {
      const r = _docs.get(id);
      return r ? `[Artifact "${r.title}" (${id})]` : `[Artifact ${id}]`;
    });
  }

  // ── Context injection (chat-driven updates) ─────────────────────────────
  function relevantArtifact(text) {
    if (!_docs.size) return null;
    const t = String(text || '');
    for (const r of _docs.values()) if (r.id && t.includes(r.id)) return r;               // explicit identifier
    for (const r of _docs.values()) {                                                     // explicit title
      if (r.title && r.title.length >= 5 && t.toLowerCase().includes(r.title.toLowerCase())) return r;
    }
    // Code-block edit intent owns the message (patch system handles it)
    if (typeof isEditIntent === 'function') { try { if (isEditIntent(t)) return null; } catch (_) {} }
    if (/\b(edit|update|change|revise|modify|fix|improve|shorten|expand|rewrite|reword|add|remove|delete|insert|replace|rephrase|polish|restructure|extend|trim)\b/i.test(t)) {
      let best = null, bestTs = -1;
      for (const r of _docs.values()) {
        const v = r.versions[r.versions.length - 1];
        const ts = v ? v.ts : 0;
        if (ts > bestTs) { best = r; bestTs = ts; }
      }
      return best;
    }
    return null;
  }

  function buildArtifactContextInjection(rec) {
    const content = rec.code || '';
    if (!content) return null;
    const trunc = content.length > CTX_CAP
      ? content.slice(0, CTX_CAP) + '\n[… content truncated — if your edit targets a missing part, ask the user …]'
      : content;
    return 'CURRENT ARTIFACT — the user has an artifact open in a side panel:\n' +
      `identifier: ${rec.id}\ntype: ${rec.type}\ntitle: ${rec.title}\n\n` +
      `<current_content>\n${trunc}\n</current_content>\n\n` +
      `If the user's request concerns this artifact, apply the change and re-emit the COMPLETE updated artifact ` +
      `with the SAME identifier "${rec.id}" and type "${rec.type}" inside <artifact …>…</artifact> tags. ` +
      `Never emit a partial update or the patch format for artifacts. If the request is unrelated to this artifact, ignore this context.`;
  }

  // ── Panel header UI (version dropdown, Word button, export) ─────────────
  function onActivate(art) {
    try {
      const isDoc = !!(art && art._doc);
      const verBtn = document.getElementById('art-ver-btn');
      const wordBtn = document.getElementById('art-word-btn');
      const dlBtn = document.getElementById('art-dl-btn');
      if (verBtn) {
        const n = isDoc ? (art.versions || []).length : 0;
        verBtn.style.display = n > 1 ? '' : 'none';
        verBtn.textContent = 'v' + ((isDoc ? (art.activeVersion || 0) : 0) + 1) + ' ▾';
      }
      if (wordBtn) wordBtn.style.display = (isDoc && art.kind === 'doc') ? '' : 'none';
      if (dlBtn) dlBtn.textContent = isDoc ? '⬇ Export' : '⬇ Download';
      closeMenus();
    } catch (_) {}
  }

  function openWordForActive() {
    try {
      const art = (typeof _artifacts !== 'undefined') ? _artifacts[(typeof _activeArt !== 'undefined' ? _activeArt : 0)] : null;
      if (art && art._doc) openInWordEditor(art.id);
    } catch (_) {}
  }

  function closeMenus() {
    const m = document.getElementById('art-pop-menu');
    if (m) m.remove();
  }

  function _popupMenu(html) {
    closeMenus();
    const panel = document.getElementById('artifact-panel');
    if (!panel) return null;
    const m = document.createElement('div');
    m.id = 'art-pop-menu';
    m.className = 'art-pop-menu';
    m.innerHTML = html;
    panel.appendChild(m);
    return m;
  }

  function toggleVerMenu() {
    if (document.getElementById('art-pop-menu')) { closeMenus(); return; }
    const art = (typeof _artifacts !== 'undefined') ? _artifacts[(typeof _activeArt !== 'undefined' ? _activeArt : 0)] : null;
    if (!art || !art._doc) return;
    const rows = (art.versions || []).map((v, i) =>
      `<div class="apm-row${i === art.activeVersion ? ' cur' : ''}" onclick="ArtifactDoc.switchVersion(${i})">` +
      `<span class="apm-v">v${i + 1}</span><span class="apm-t">${E(fmtAgo(v.ts))}</span>` +
      `${v.origin === 'manual' ? '<span class="apm-o">edited</span>' : ''}` +
      `${v.origin === 'rescue' ? '<span class="apm-o">recovered</span>' : ''}` +
      `${i === art.activeVersion ? '<span class="apm-cur">current</span>' : ''}</div>`
    ).reverse().join('');
    _popupMenu('<div class="apm-hdr">Version history</div>' + rows);
  }

  function switchVersion(n) {
    closeMenus();
    const art = (typeof _artifacts !== 'undefined') ? _artifacts[(typeof _activeArt !== 'undefined' ? _activeArt : 0)] : null;
    if (!art || !art._doc || !art.versions || !art.versions[n]) return;
    art.activeVersion = n;
    _syncCode(art);
    try { if (typeof loadArtFrame === 'function') loadArtFrame(art); } catch (_) {}
    onActivate(art);
    try { if (typeof autoSaveConversation === 'function') autoSaveConversation(); } catch (_) {}
    if (typeof toast === 'function') toast(`Viewing v${n + 1} — new updates will still create v${art.versions.length + 1}`, 'ok');
  }

  function openExportMenu() {
    if (document.getElementById('art-pop-menu')) { closeMenus(); return; }
    const art = (typeof _artifacts !== 'undefined') ? _artifacts[(typeof _activeArt !== 'undefined' ? _activeArt : 0)] : null;
    if (!art) return;
    if (!art._doc) { closeMenus(); try { if (typeof dlArtifact === 'function') dlArtifact(); } catch (_) {} return; }
    let items = '';
    const row = (fmt, label) => `<div class="apm-row" onclick="ArtifactDoc.exportAs('${fmt}')">${label}</div>`;
    if (art.kind === 'doc') {
      items = row('md', '📄 Markdown (.md)') + row('html', '🌐 Styled HTML (.html)') +
        row('pdf', '📕 PDF document') + row('docx', '📝 Word document (.docx)') +
        '<div class="apm-sep"></div>' + row('word', '✏️ Open in Word editor');
    } else if (art.kind === 'html') {
      items = row('html', '🌐 HTML (.html)');
    } else if (art.kind === 'svg') {
      items = row('svg', '🖼️ SVG (.svg)');
    } else if (art.kind === 'mermaid') {
      items = row('mmd', '📊 Mermaid source (.mmd)') + row('rsvg', '🖼️ Rendered SVG (.svg)');
    } else {
      items = row('raw', '⬇ Download file');
    }
    _popupMenu('<div class="apm-hdr">Export artifact</div>' + items);
  }

  function _dlBlob(text, name, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (typeof toast === 'function') toast('Downloaded ' + name, 'ok');
  }

  function slug(t) {
    return String(t || 'atlas-artifact').toLowerCase().replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'atlas_artifact';
  }

  function exportAs(fmt) {
    closeMenus();
    const art = (typeof _artifacts !== 'undefined') ? _artifacts[(typeof _activeArt !== 'undefined' ? _activeArt : 0)] : null;
    if (!art) return;
    const name = slug(art.title);
    if (fmt === 'raw') { try { if (typeof dlArtifact === 'function') dlArtifact(); } catch (_) {} return; }
    if (fmt === 'word') { if (art._doc) openInWordEditor(art.id); return; }
    if (fmt === 'md')   { _dlBlob(art.code || '', name + '.md', 'text/markdown;charset=utf-8'); return; }
    if (fmt === 'html') {
      const html = (art.kind === 'html') ? (art.code || '') : buildDocHtml(art, { standalone: true });
      _dlBlob(html, name + '.html', 'text/html;charset=utf-8');
      return;
    }
    if (fmt === 'svg')  { _dlBlob(art.code || '', name + '.svg', 'image/svg+xml'); return; }
    if (fmt === 'mmd')  { _dlBlob(art.code || '', name + '.mmd', 'text/plain;charset=utf-8'); return; }
    if (fmt === 'rsvg') {
      try {
        const frame = document.getElementById('artifact-frame');
        const svg = frame && frame.contentDocument && frame.contentDocument.querySelector('#stage svg, body svg');
        if (!svg) { if (typeof toast === 'function') toast('Diagram not rendered yet — try again in a moment', 'er'); return; }
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        _dlBlob(svg.outerHTML, name + '.svg', 'image/svg+xml');
      } catch (e) {
        if (typeof toast === 'function') toast('Could not extract SVG: ' + (e.message || e), 'er');
      }
      return;
    }
    if (fmt === 'pdf' || fmt === 'docx') {
      const json = mdToDocxJson(art.code || '', art.title);
      const jsonStr = JSON.stringify(json);
      try {
        if (fmt === 'pdf' && typeof generatePDF === 'function') generatePDF(jsonStr, name + '.pdf');
        if (fmt === 'docx' && typeof generateDOCX === 'function') generateDOCX(jsonStr, name + '.docx');
      } catch (e) {
        if (typeof toast === 'function') toast('Export failed: ' + (e.message || e), 'er');
      }
      return;
    }
  }

  // ── Markdown → OUTPUT_FMT JSON (Word editor / PDF / DOCX bridge) ────────
  function mdToDocxJson(md, title) {
    const lines = String(md || '').split('\n');
    const out = { title: '', sections: [] };
    const strip = (s) => String(s)
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    let cur = null;
    // keepPendingHeading: a blank line right after "## Heading" must NOT
    // discard the heading — the section's body usually follows after it.
    const flush = (keepPendingHeading) => {
      if (cur && ((cur.body && cur.body.trim()) || (cur.bullet_points && cur.bullet_points.length))) {
        // A bullets-only run following a section without bullets belongs to
        // that section ("body\n\n- bullets" is the common markdown shape).
        const prev = out.sections[out.sections.length - 1];
        const isBulletsOnly = cur.bullet_points && cur.bullet_points.length && !(cur.body && cur.body.trim());
        if (isBulletsOnly && !cur.heading && prev && (!prev.bullet_points || !prev.bullet_points.length)) {
          prev.bullet_points = cur.bullet_points.map(strip);
        } else {
          if (cur.body != null) cur.body = strip(cur.body);
          if (cur.bullet_points) cur.bullet_points = cur.bullet_points.map(strip);
          if (!cur.heading) delete cur.heading;
          out.sections.push(cur);
        }
        cur = null;
      } else if (cur && !keepPendingHeading) {
        cur = null;   // discard a content-less (heading-only or empty) section
      }
    };
    let inFence = false;
    for (const line of lines) {
      if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
      let m;
      if (!inFence && (m = /^\s{0,3}#\s+(.+)$/.exec(line))) {
        flush(false);
        if (!out.title) out.title = strip(m[1]);
        continue;
      }
      if (!inFence && (m = /^\s{0,3}#{2,6}\s+(.+)$/.exec(line))) {
        flush(false);
        cur = { heading: strip(m[1]), body: '', bullet_points: [] };
        continue;
      }
      if ((m = /^\s*[-*+]\s+(.+)$/.exec(line)) && !inFence) {
        if (!cur) cur = { heading: '', body: '', bullet_points: [] };
        (cur.bullet_points = cur.bullet_points || []).push(m[1]);
        continue;
      }
      if ((m = /^\s*\d+[.)]\s+(.+)$/.exec(line)) && !inFence) {
        if (!cur) cur = { heading: '', body: '', bullet_points: [] };
        (cur.bullet_points = cur.bullet_points || []).push(m[1]);
        continue;
      }
      if (!line.trim()) { flush(true); continue; }
      if (/^\s*\|.*\|\s*$/.test(line)) {
        if (/^[\s\-:|]+$/.test(line.trim())) continue;
        const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => strip(c.trim()));
        if (!cur) cur = { heading: '', body: '', bullet_points: [] };
        (cur.bullet_points = cur.bullet_points || []).push(cells.join(' — '));
        continue;
      }
      if (!cur) cur = { heading: '', body: '', bullet_points: [] };
      cur.body = (cur.body ? cur.body + '\n' : '') + line.trim();
    }
    flush(false);
    if (!out.title) out.title = String(title || 'Document');
    if (!out.sections.length) out.sections.push({ body: strip(String(md || '')).slice(0, 4000) || out.title });
    return out;
  }

  // ── Word visual editor bridge (office-level editor integration) ─────────
  function openInWordEditor(id) {
    const rec = _docs.get(id);
    if (!rec) return;
    try {
      if (typeof _artifacts === 'undefined' || typeof activateArtifact !== 'function') return;
      const json = mdToDocxJson(rec.code || '', rec.title);
      const code = JSON.stringify(json, null, 2);
      const bid = rec.id + ':docx';
      let br = _artifacts.find(a => a.id === bid);
      if (!br) {
        br = { id: bid, lang: 'docx-content', code, title: (rec.title || 'Document') + ' — Word', _docBridge: rec.id };
        _artifacts.push(br);
      } else {
        br.code = code;
        br.title = (rec.title || 'Document') + ' — Word';
      }
      const idx = _artifacts.indexOf(br);
      activateArtifact(idx);
      if (typeof _openVisualEditor === 'function') {
        try { _openVisualEditor(br); }
        catch (e) { if (typeof toast === 'function') toast('Could not open editor: ' + (e.message || e), 'er'); }
      }
    } catch (_) {}
  }

  // ── Manual edits from the panel text editor → new version ───────────────
  function applyManualEdit(art) {
    const ta = document.getElementById('artifact-edit-area');
    const code = (ta && ta.value) != null ? ta.value : '';
    art.versions.push({ content: code, ts: Date.now(), finalized: true, msgIdx: art.srcMsgIdx, origin: 'manual' });
    if (art.versions.length > MAX_VERSIONS) art.versions.splice(0, art.versions.length - MAX_VERSIONS);
    art.activeVersion = art.versions.length - 1;
    art.code = code;
    _collapseDup(art);
    // DOM restore — mirrors atlas.js applyArtEdit ending
    try {
      document.getElementById('artifact-editor').style.display = 'none';
      document.getElementById('artifact-frame').style.display = '';
      document.getElementById('artifact-source').style.display = '';
      document.getElementById('art-edit-toggle').classList.remove('active');
      document.getElementById('art-view-toggle').disabled = false;
    } catch (_) {}
    try { if (typeof loadArtFrame === 'function') loadArtFrame(art); } catch (_) {}
    onActivate(art);
    try { if (typeof autoSaveConversation === 'function') autoSaveConversation(); } catch (_) {}
    if (typeof toast === 'function') toast(`Saved as v${art.activeVersion + 1}`, 'ok');
  }

  // ── Selection-based "Edit with Claude" ──────────────────────────────────
  function _onMsg(e) {
    try {
      if (!e.data || e.data.type !== 'atlas-art-edit') return;
      _pendingEdit = e.data;
      document.getElementById('art-edit-doc').textContent = e.data.title || 'Document';
      const q = document.getElementById('art-edit-quote');
      q.textContent = e.data.sel ? '"' + e.data.sel + '"' : '';
      q.style.display = e.data.sel ? '' : 'none';
      const inp = document.getElementById('art-edit-input');
      inp.value = '';
      document.getElementById('art-edit-modal').style.display = 'flex';
      setTimeout(() => { try { inp.focus(); } catch (_) {} }, 60);
    } catch (_) {}
  }

  function cancelEditModal() {
    _pendingEdit = null;
    const m = document.getElementById('art-edit-modal');
    if (m) m.style.display = 'none';
  }

  function sendEditModal() {
    const ta = document.getElementById('art-edit-input');
    const v = ta ? ta.value.trim() : '';
    if (!v || !_pendingEdit) { cancelEditModal(); return; }
    const d = _pendingEdit;
    _pendingEdit = null;
    cancelEditModal();
    const prompt =
      `Update the document artifact "${d.title}" (identifier: ${d.id}).\n\n` +
      (d.sel ? `I selected this passage in the document:\n\n"${d.sel}"\n\n` : '') +
      `Requested change: ${v}\n\n` +
      `Re-emit the COMPLETE updated document inside <artifact identifier="${d.id}" type="text/markdown" title="${d.title}"> tags. Do not use the patch format for this artifact.`;
    try {
      const inp = document.getElementById('user-input');
      inp.value = prompt;
      if (typeof autoResize === 'function') autoResize(inp);
      if (typeof sendMessage === 'function') sendMessage();
    } catch (_) {}
  }

  // ── Persistence ─────────────────────────────────────────────────────────
  function serialize() {
    const out = [];
    for (const r of _docs.values()) {
      out.push({
        id: r.id, kind: r.kind, type: r.type, lang: r.lang, title: r.title,
        activeVersion: r.activeVersion, srcMsgIdx: r.srcMsgIdx,
        versions: (r.versions || []).map(v => ({
          content: v.content, ts: v.ts, finalized: v.finalized !== false,
          msgIdx: v.msgIdx, origin: v.origin,
        })),
      });
    }
    return out;
  }

  function restore(arr) {
    _docs.clear();
    for (const d of (arr || [])) {
      try {
        if (!d || !d.id || !Array.isArray(d.versions) || !d.versions.length) continue;
        const rec = {
          id: d.id, kind: d.kind || 'doc', type: d.type || 'text/markdown',
          lang: d.lang || 'md', title: d.title || d.id,
          activeVersion: Math.max(0, Math.min(d.activeVersion || d.versions.length - 1, d.versions.length - 1)),
          srcMsgIdx: d.srcMsgIdx, _doc: true,
          versions: d.versions.map(v => ({
            content: v.content || '', ts: v.ts || Date.now(),
            finalized: v.finalized !== false, msgIdx: v.msgIdx, origin: v.origin,
          })),
        };
        _syncCode(rec);
        _docs.set(rec.id, rec);
      } catch (_) {}
    }
  }

  function reset() { _docs.clear(); closeMenus(); _pendingEdit = null; }

  // ── Misc ────────────────────────────────────────────────────────────────
  function fmtAgo(ts) {
    const d = Date.now() - (ts || 0);
    if (d < 45e3) return 'just now';
    if (d < 3600e3) return Math.max(1, Math.floor(d / 60e3)) + 'm ago';
    if (d < 86400e3) return Math.floor(d / 3600e3) + 'h ago';
    return new Date(ts).toLocaleDateString();
  }

  function tabLabel(a) {
    const meta = KIND_META[a.kind] || KIND_META.doc;
    const t = String(a.title || a.id || '');
    return meta.icon + ' ' + E(t.length > 16 ? t.slice(0, 15) + '…' : t);
  }

  function getSystemPrompt() { return ART_SYSTEM_PROMPT; }

  // ── Init ────────────────────────────────────────────────────────────────
  function _init() {
    window.addEventListener('message', _onMsg);
    // Click-away closes popup menus (version / export)
    document.addEventListener('click', (e) => {
      const m = document.getElementById('art-pop-menu');
      if (!m) return;
      const verBtn = document.getElementById('art-ver-btn');
      if (m.contains(e.target)) return;
      if (verBtn && verBtn.contains(e.target)) return;
      closeMenus();
    }, true);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
    else _init();
  }

  // ── Public API ──────────────────────────────────────────────────────────
  window.ArtifactDoc = {
    // stream pipeline
    beginStream, ingest, cleanForChat, finalizeStream, finalizePartial,
    // rendering hooks
    extractCardTokens, renderCardHTML, toggleCard, openFromCard, historyize,
    loadFrame, onActivate, tabLabel,
    // prompts
    getSystemPrompt, relevantArtifact, buildArtifactContextInjection,
    // panel ui
    toggleVerMenu, switchVersion, openExportMenu, exportAs, openWordForActive,
    openInWordEditor, applyManualEdit, closeMenus, rerenderActive,
    // edit modal
    cancelEditModal, sendEditModal,
    // persistence
    serialize, restore, reset,
    // misc
    mdToHtml, mdToDocxJson, buildDocHtml,
    get docs() { return _docs; },
  };
})();
