/**
 * Atlas — AI Chat
 * JavaScript: atlas.js
 *
 * Sections (search by ── comment):
 *   IMAGE GENERATION MODELS   — IMAGE_GEN_MODELS constant
 *   FALLBACK MODEL LISTS      — DeepSeek / Gemini / OpenAI fallbacks
 *   STATE                     — S{} global state object
 *   INIT                      — DOMContentLoaded bootstrap
 *   CLARIFYING QUESTIONS      — Auto-detect ambiguous prompts
 *   SECURE STORAGE (IDB)      — IndexedDB KeyStore + conversation store
 *   CONVERSATIONS             — Load/save/render chat list
 *   MODEL SELECTOR            — Dropdown, filtering, favourites
 *   MESSAGES                  — Render, send, stream, edit, regen
 *   MARKDOWN RENDERER         — parseMarkdown(), code blocks, syntax highlight
 *   ARTIFACT PANEL            — Preview iframe, tabs, source view, edit
 *   VISUAL EDITOR (DOCX)      — Word-like rich-text editor
 *   VISUAL EDITOR (PPTX)      — PowerPoint-like slide editor
 *   FILE GENERATION           — PDF / DOCX / PPTX / CSS file download
 *   FILE ATTACHMENTS          — Attach local files to messages
 *   OUTPUT FORMAT BAR         — fmt-bar chip logic
 *   COST TRACKER              — Token/cost estimation and display
 *   CONTEXT BAR               — Token context fill bar
 *   SETTINGS                  — Settings modal open/save/apply
 *   TOAST                     — Toast notification helper
 *   SIDEBAR                   — Toggle, search, new chat
 *   THEME                     — Dark / light theme switching
 *   FONT / DENSITY            — Chat font and density settings
 *   DEBUG PANEL               — Developer debug console
 *   API CALLS                 — callApi(), streaming, providers
 *   TOOL USE                  — Tool definitions, execution, confirm modal
 *   IMAGE GENERATION          — Image gen mode, rendering
 *   WEB SEARCH                — OpenRouter web-search plugin toggle
 *   SKILLS SYSTEM             — Built-in + custom skills, auto-detect
 *   GOOGLE CONNECTOR          — OAuth, Gmail/Calendar/Drive tools
 *   GOOGLE DRIVE BACKUP       — Backup / restore chats to Drive
 *   SYSTEM PROMPT PRESETS     — SYSTEM_PROMPT_PRESETS constant
 *   ARTIFACT RESIZE           — Drag-to-resize artifact panel
 */

// ── IMAGE GENERATION MODELS ──
// These models support image generation via OpenRouter
const IMAGE_GEN_MODELS = [
  'openai/dall-e-3',
  'openai/dall-e-2',
  'stability/stable-diffusion-xl',
  'stability/stable-diffusion-3',
  'stability/stable-diffusion-3.5-large',
  'black-forest-labs/flux-1.1-pro',
  'black-forest-labs/flux-schnell',
  'black-forest-labs/flux-dev',
  'black-forest-labs/flux-pro',
  'recraft-ai/recraft-v3',
  'ideogram-ai/ideogram-v2',
];

// Fallback model list used if the live API fetch fails.
// Pricing in $/token (per-token, not per-million).
const DEEPSEEK_MODELS_FALLBACK = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', context_length: 1048576,
    pricing: { prompt: String(0.14 / 1e6), completion: String(0.28 / 1e6) },
    description: 'Fast & efficient — 1M context, thinking + non-thinking modes' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', context_length: 1048576,
    pricing: { prompt: String(1.74 / 1e6), completion: String(3.48 / 1e6) },
    description: 'Frontier performance — 1.6T params, 1M context, thinking + non-thinking modes' },
];

// Gemini models with pricing in $/token
const GEMINI_MODELS_FALLBACK = [
  { id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 3.1 Flash Lite Preview', context_length: 1048576,
    pricing: { prompt: String(0), completion: String(0) },
    description: 'Gemini 3.1 Flash Lite — fastest free-tier model' },
  { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash Preview', context_length: 1048576,
    pricing: { prompt: String(0.15 / 1e6), completion: String(0.60 / 1e6) },
    description: 'Latest Gemini 2.5 Flash — fast, multimodal, 1M context' },
  { id: 'gemini-2.5-pro-preview-06-05', name: 'Gemini 2.5 Pro Preview', context_length: 1048576,
    pricing: { prompt: String(1.25 / 1e6), completion: String(10.00 / 1e6) },
    description: 'Most capable Gemini 2.5 — deep reasoning, 1M context' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', context_length: 1048576,
    pricing: { prompt: String(0.10 / 1e6), completion: String(0.40 / 1e6) },
    description: 'Fast, cost-effective Gemini 2.0 with 1M context' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', context_length: 1048576,
    pricing: { prompt: String(0.075 / 1e6), completion: String(0.30 / 1e6) },
    description: 'Lightest Gemini 2.0 model — ultra-fast and free-tier friendly' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', context_length: 2097152,
    pricing: { prompt: String(1.25 / 1e6), completion: String(5.00 / 1e6) },
    description: 'Highly capable with 2M context window' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', context_length: 1048576,
    pricing: { prompt: String(0.075 / 1e6), completion: String(0.30 / 1e6) },
    description: 'Fast and versatile — 1M context, free tier available' },
  { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B', context_length: 1048576,
    pricing: { prompt: String(0.0375 / 1e6), completion: String(0.15 / 1e6) },
    description: 'Smallest, most affordable Gemini model — great for simple tasks' },
];

// ── STATE ──────────────────────────────────────────────────────────────────
const S = {
  key: '', model: null,
  provider: 'openrouter', // 'openrouter' | 'deepseek' | 'gemini' | 'openai' | 'local'
  deepseekKey: '',
  geminiKey: '',
  openaiKey: '',
  openaiModels: [],
  localBaseUrl: 'http://localhost:11434', // Ollama default; user-configurable
  localKey: '', // optional bearer token (LM Studio, etc.)
  localModels: [],
  allModels: [], filtModels: [], activeFilter: 'all',
  favModels: [],
  convs: [], chatId: null, msgs: [],
  files: [],
  totalCost: 0, budget: 0,
  cfg: { temp: 0.55, maxTok: 4096, topP: 0.95, imgSize: '1024x1024', imgModel: '', donts: '', font: 'DM Sans', fontSize: 14, smartPatch: true },
  streaming: false, ac: null,
  sbOpen: true, theme: 'dark',
  imageGenMode: false,
  webSearchMode: false,
  toolDefinitions: [],
  codeStore: new Map(), // blockId -> { lang, content } — used by patch edit system
};

// ── INIT ───────────────────────────────────────────────────────────────────
// [CHANGED] Now uses initSecureStorage() which handles IndexedDB + KeyStore
window.addEventListener('DOMContentLoaded', () => {
  autoResize(document.getElementById('user-input'));
  loadSkillsState();
  renderChatList();
  if (!location.href.startsWith('http')) showOriginBanner();
  // [CHANGED] Async secure init replaces synchronous loadFromStorage + reloadModels
  initSecureStorage().then(() => {
    if (S.cfg.font && S.cfg.font !== 'DM Sans') applyFont(S.cfg.font, S.cfg.fontSize || 14);
    if (S.cfg.fontSize && S.cfg.fontSize !== 14) previewFontSize(S.cfg.fontSize);
    if (S.cfg.chatDensity != null) previewChatDensity(S.cfg.chatDensity);
    initToolDefinitions();
  }).catch(e => {
    console.warn('Atlas: initSecureStorage failed, falling back', e);
    // Fallback: load from localStorage the old way
    loadFromStorage();
    if (S.cfg.font && S.cfg.font !== 'DM Sans') applyFont(S.cfg.font, S.cfg.fontSize || 14);
    if (S.cfg.fontSize && S.cfg.fontSize !== 14) previewFontSize(S.cfg.fontSize);
    if (S.cfg.chatDensity != null) previewChatDensity(S.cfg.chatDensity);
    const hasKey = !!(S.key || S.deepseekKey || S.geminiKey || S.openaiKey);
    if (hasKey) reloadModels(); else openKeyModal();
    initToolDefinitions();
  });
});

document.addEventListener('click', e => {
  if (!document.getElementById('msw').contains(e.target)) closeMdd();
});


// ── CLARIFYING QUESTIONS ──────────────────────────────────────────────────
// Detects ambiguous requests and surfaces a quick clarify bar before sending.

const CLARIFY_TRIGGERS = [
  // Each entry: { pattern, question, options }
  {
    pattern: /(write|make|create|build|generate|design).*(app|application|website|web app|tool|game)/i,
    question: 'What platform/stack?',
    options: ['HTML/CSS/JS', 'React', 'Python', 'Node.js', 'Mobile app']
  },
  {
    pattern: /(write|draft|create).*(email|message|letter|memo)/i,
    question: 'What tone?',
    options: ['Formal', 'Friendly', 'Direct', 'Apologetic', 'Persuasive']
  },
  {
    pattern: /(explain|what is|how does|tell me about)/i,
    question: 'How much depth?',
    options: ['Simple overview', 'Detailed explanation', 'With examples', 'Like I\'m an expert']
  },
  {
    pattern: /(design|create|make).*(logo|icon|image|graphic|poster|banner)/i,
    question: 'Style preference?',
    options: ['Minimal', 'Bold/Colorful', 'Professional', 'Playful', 'Dark theme']
  },
  {
    pattern: /(analyze|review|evaluate|assess|check)/i,
    question: 'What focus?',
    options: ['Quick overview', 'Deep dive', 'Actionable fixes', 'Pros & cons']
  },
  {
    pattern: /(translate)/i,
    question: 'Which language?',
    options: ['Spanish', 'French', 'Arabic', 'German', 'Japanese', 'Other…']
  },
  {
    pattern: /(summarize|summary|tldr|tl;dr)/i,
    question: 'Summary length?',
    options: ['1 sentence', '3 bullet points', 'Short paragraph', 'Detailed']
  },
  {
    pattern: /(story|fiction|write.*scene|creative)/i,
    question: 'Tone?',
    options: ['Serious', 'Humorous', 'Dark', 'Uplifting', 'Suspenseful']
  },
];

let _clarifyPending = null; // { text, trigger }
let _clarifyResolved = false;

function checkClarify(text) {
  // Don't clarify if message is very short (likely a follow-up), or already has context
  if (text.length < 15 || text.split(' ').length < 4) return false;
  // Don't clarify if message already answers its own question with specific details
  if (text.split(' ').length > 25) return false; // long detailed messages don't need clarification
  // Don't clarify if there's already active conversation context
  if (S.msgs.length > 0) return false;

  for (const trigger of CLARIFY_TRIGGERS) {
    if (trigger.pattern.test(text)) {
      return trigger;
    }
  }
  return false;
}

function showClarify(text, trigger) {
  _clarifyPending = { text, trigger };
  _clarifyResolved = false;
  const bar = document.getElementById('clarify-bar');
  const qEl = document.getElementById('clarify-question');
  const optEl = document.getElementById('clarify-options');
  if (!bar || !qEl || !optEl) return;
  qEl.textContent = '✦ ' + trigger.question;
  optEl.innerHTML = trigger.options.map(opt =>
    `<button class="clarify-ans" onclick="resolveClarify(this, '${opt.replace(/'/g, "\'")}')">${opt}</button>`
  ).join('');
  bar.classList.add('show');
}

function resolveClarify(btn, answer) {
  _clarifyResolved = true;
  dismissClarify();
  // Append the answer context to the pending message and send
  const enriched = _clarifyPending.text + ' [' + _clarifyPending.trigger.question + ': ' + answer + ']';
  const inp = document.getElementById('user-input');
  inp.value = enriched;
  _clarifyPending = null;
  sendMessage();
}

function dismissClarify() {
  const bar = document.getElementById('clarify-bar');
if (bar) bar.classList.remove('show');
  _clarifyPending = null;
}

// ── INTENT DETECTION FOR AUTO-DETECT SKILLS ───────────────────────────
// Keywords mapped to skill IDs - first match wins (priority order: gamedev > frontend > document > code > data > creative)
const INTENT_KEYWORDS = {
  gamedev: ['game', 'games', 'play', 'player', 'animation', 'physics', 'unity', 'godot', 'canvas', 'arcade', 'controller', 'score', 'level', 'puzzle', 'sprite'],
  frontend: ['website', 'web app', 'ui', 'button', 'css', 'html', 'layout', 'design', 'responsive', 'frontend', 'web', 'landing page', 'component', 'interface', 'card', 'modal', 'navbar', 'sidebar'],
  document: ['write', 'report', 'essay', 'memo', 'article', 'summary', 'document', 'draft', 'letter', 'email', 'proposal', 'outline'],
  code: ['code', 'function', 'bug', 'algorithm', 'python', 'javascript', 'debug', 'fix', 'api', 'class', 'variable', 'refactor', 'implement'],
  data: ['analyze', 'chart', 'graph', 'data', 'statistics', 'excel', 'csv', 'metric', 'trend', 'correlation', 'visualize', 'plot'],
  creative: ['story', 'fiction', 'poem', 'script', 'creative', 'narrative', 'character', 'dialogue', 'scene'],
  analysis: ['analyze', 'review', 'evaluate', 'assess', 'compare', ' critique', ' pros', ' cons', 'benefit'],
};

// Store pending detected skill (cleared when message sent)
let _detectedSkill = null;
let _detectedSkillDismissed = false;

function detectIntent(text) {
  if (!text || !S.skills.smartAuto || _detectedSkillDismissed) return null;
  
  const lower = text.toLowerCase();
  
  // Check in priority order (gamedev first)
  const priorityOrder = ['gamedev', 'frontend', 'document', 'code', 'data', 'creative', 'analysis'];
  
  for (const skillId of priorityOrder) {
    const keywords = INTENT_KEYWORDS[skillId];
    if (!keywords) continue;
    
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        const skill = BUILTIN_SKILLS.find(s => s.id === skillId);
        if (skill) return skill;
      }
    }
  }
  
  // Also check custom skills (they get lowest priority)
  if (S.skills.customSkills && S.skills.customSkills.length > 0) {
    for (const skill of S.skills.customSkills) {
      if (skill.prompt && lower.includes(skill.name.toLowerCase())) {
        return skill;
      }
    }
  }
  
  return null;
}

function showDetectedIntent(skill) {
  if (!skill) return;
  
  const pill = document.getElementById('detected-intent-pill');
  const icon = document.getElementById('detected-icon');
  const name = document.getElementById('detected-name');
  
  if (pill && icon && name) {
    icon.textContent = skill.icon;
    name.textContent = skill.name;
    pill.classList.add('show');
  }
}

function dismissDetectedIntent(e) {
  if (e) e.stopPropagation();
  _detectedSkillDismissed = true;
  _detectedSkill = null;
  const pill = document.getElementById('detected-intent-pill');
  if (pill) pill.classList.remove('show');
}

function applyDetectedIntent() {
  if (_detectedSkill) {
    setActiveSkill(_detectedSkill.id);
    dismissDetectedIntent();
  }
}

function checkIntentOnInput(text) {
  // Clear dismissed flag when user starts typing new message
  if (text.length < 3) {
    _detectedSkillDismissed = false;
  }
  
  // Only check if smart auto-detect is enabled
  if (!S.skills.smartAuto) {
    dismissDetectedIntent();
    return;
  }
  
  // Don't re-detect while we already have one showing
  const pill = document.getElementById('detected-intent-pill');
  if (pill && pill.classList.contains('show')) return;
  
  // Detect intent with delay to avoid checking on every keystroke
  clearTimeout(S._intentCheckTimeout);
  S._intentCheckTimeout = setTimeout(() => {
    const skill = detectIntent(text);
    if (skill && skill.id) {
      _detectedSkill = skill;
      _detectedSkillDismissed = false;
      showDetectedIntent(skill);
    }
  }, 500);
}

// ── SKILLS SYSTEM ─────────────────────────────────────────────────────────

const BUILTIN_SKILLS = [
  {
    id: 'frontend',
    icon: '🎨',
    name: 'Frontend Design',
    desc: 'Beautiful, production-grade UI components and web apps',
    prompt: `The user wants a frontend interface. Prioritize these things:

AESTHETICS: Commit to a specific, intentional visual direction before writing a line of code. Pick an aesthetic (brutalist, editorial, soft/organic, retro-futuristic, luxury minimal, etc.) and execute it with precision. Every design decision — fonts, spacing, color, motion — should serve that direction. Avoid generic choices: no Inter/Roboto/Arial, no purple-gradient-on-white, no cookie-cutter card layouts.

CODE QUALITY: Deliver complete, working code. Use CSS custom properties for theming. Animations should feel purposeful, not decorative. Handle responsiveness. Prefer CSS over JS for visual effects.

FONTS: Choose distinctive, characterful typefaces from Google Fonts or system stacks. Pair a display font with a body font. The font choice should feel inevitable for the aesthetic.

Do not describe what you're going to build at length — just build it. A brief one-sentence framing is fine, then the code.`
  },
  {
    id: 'document',
    icon: '📄',
    name: 'Document Writing',
    desc: 'Professional reports, memos, essays and structured documents',
    prompt: `The user wants a written document. Prioritize these things:

STRUCTURE: Open with the most important information. Use clear headings only where they genuinely aid navigation — don't add them just to look organized. Every section should earn its place.

PROSE: Write in plain, direct language. Active voice by default. Sentences that say exactly what they mean, nothing more. Cut filler phrases ("it is important to note that", "in conclusion", "as we can see"). Vary sentence length for rhythm.

TONE: Match the register to the context. A legal memo is not a blog post. An investor update is not an academic essay. Read the request carefully for formality cues.

LENGTH: Be as long as the content requires and no longer. Don't pad. Don't repeat points in different words just to fill space.

Do not preface the document with meta-commentary about what you're writing — just write it.`
  },
  {
    id: 'code',
    icon: '💻',
    name: 'Code Assistant',
    desc: 'Clean code, debugging, algorithms, best practices',
    prompt: `The user wants help with code. Prioritize these things:

CORRECTNESS FIRST: Working code beats elegant code. Handle the edge cases that actually matter for this use case. Don't over-engineer.

CLARITY: Code should read like clear prose. Name things for what they are. Comments explain *why*, not *what* — the code itself should be readable enough to show what it does. Avoid abbreviations in names.

IDIOMS: Use the conventions of the language. Python should look like Python. JavaScript should look like modern JavaScript. Don't import patterns from other languages.

DEBUGGING: When diagnosing a bug, identify the root cause before suggesting a fix. A fix that treats a symptom is worse than no fix.

TRADE-OFFS: When multiple approaches exist, briefly explain what each optimizes for, then recommend one with a reason.

Show the code directly. A short explanation of the approach is useful; a long preamble is not.`
  },
  {
    id: 'analysis',
    icon: '🧠',
    name: 'Deep Analysis',
    desc: 'Systematic reasoning, research synthesis, critical thinking',
    prompt: `The user wants careful analysis. Prioritize these things:

STEEL-MAN: Before critiquing a position, state the strongest version of it. Don't argue against strawmen.

DISTINGUISH: Separate facts from inferences from opinions. Be explicit about which is which. Quantify uncertainty when you can ("likely", "almost certainly", "plausible but unverified").

ASSUMPTIONS: Surface the assumptions doing the most work in an argument. An argument is only as strong as its weakest assumption.

STRUCTURE: Lead with the conclusion or key insight, then support it. Don't make the reader wait until the end to know where you're going.

INTELLECTUAL HONESTY: Say when you don't know. Say when the evidence is genuinely mixed. Resist the pull toward false balance (not all positions deserve equal weight) and false certainty (not all questions have clean answers).

Avoid framework-for-framework's-sake. Use structure when it clarifies — not to look rigorous.`
  },
  {
    id: 'data',
    icon: '📊',
    name: 'Data Analysis',
    desc: 'Interpret data, statistics, charts and extract insights',
    prompt: `The user wants help understanding or working with data. Prioritize these things:

INSIGHT OVER DESCRIPTION: Don't just describe what the numbers say — say what they mean. "Revenue grew 12% YoY" is description. "Revenue grew 12% despite a flat market, suggesting market share gains" is insight.

CONTEXT: Raw numbers mean little without baselines, benchmarks, or comparisons. Always ask: compared to what?

CAUSATION VS CORRELATION: Be explicit when you're making a causal claim vs. observing a pattern. Most data shows correlation.

VISUALIZATION: Choose chart types that match the data structure. Bar charts for comparisons, line charts for trends over time, scatter plots for relationships. Avoid pie charts with more than 4 slices.

STATISTICS: When using statistical concepts, explain them plainly. Don't assume the reader knows what a p-value or confidence interval means.

Flag data quality issues when you spot them (missing values, suspicious outliers, inconsistent units) — don't silently work around them.`
  },
  {
    id: 'gamedev',
    icon: '🎮',
    name: 'Game Developer',
    desc: 'Game mechanics, loops, physics, engines and interactive experiences',
    prompt: `The user wants help building a game or interactive experience. Prioritize these things:

GAME FEEL: Prioritize responsiveness and juice. Controls should feel tight. Feedback (visual, audio cues, screen shake, particle effects) makes actions satisfying. A simple mechanic with great feel beats a complex mechanic that feels sluggish.

GAME LOOP: Identify the core loop (play → reward → progress → repeat) and make it tight. Everything should serve the loop. Cut mechanics that don't feed back into it.

CODE ARCHITECTURE: For browser games use requestAnimationFrame with a fixed timestep. Separate update logic from render logic. Use an entity-component or simple object pattern — avoid deep inheritance. Keep physics deterministic if possible.

BALANCE: When tuning numbers (speed, damage, spawn rates, difficulty curves), give concrete values and explain the reasoning. Playtesting intuition beats theory — suggest testing iterations.

SCOPE: Game projects balloon. Recommend the smallest playable version first. Get the core loop fun before adding features.

Deliver working code. For canvas/WebGL games, include the full game loop. For Unity/Godot/other engines, give complete script files with proper lifecycle methods.`
  },
  {
    id: 'creative',
    icon: '🎭',
    name: 'Creative Writing',
    desc: 'Storytelling, fiction, scripts, vivid descriptive prose',
    prompt: `The user wants creative writing. Prioritize these things:

SHOW DON'T TELL: Render the scene. Let action and detail carry emotion — don't name the emotion. "She slammed the door" tells more than "she was angry".

SPECIFICITY: Specific details are more vivid than general ones. Not "a car" but "a dented 2003 Civic with a cracked bumper". Specificity creates believability.

VOICE: Commit to a voice and stay in it. Inconsistent register breaks immersion. The diction, rhythm, and perspective should all belong to the same world.

SURPRISE: Find the unexpected angle — the unusual POV, the subverted expectation, the detail that reframes everything before it. Avoid the first idea; the first idea is usually the cliché.

PACING: Control tempo through sentence length and paragraph breaks. Short sentences accelerate. Longer ones slow the reader down and let a moment breathe. Use both deliberately.

ENDINGS: End on something — an image, a turn, a quiet resonance. Don't summarize. Don't explain.

Dive into the work. Don't preface it with notes about your approach unless asked.`
  },
];

// Skills state
S.skills = {
  customSkills: [],
  activeSkillId: null,
  smartAuto: false,
};

function loadSkillsState() {
  try {
    const raw = localStorage.getItem('atlas_skills_v1');
    if (raw) {
      const d = JSON.parse(raw);
      S.skills.customSkills = d.customSkills || [];
      S.skills.activeSkillId = d.activeSkillId || null;
      S.skills.smartAuto = d.smartAuto === true; // explicit: default OFF unless user enabled it
    }
  } catch(e) {}
  updateSkillPill();
}

function saveSkillsState() {
  try {
    localStorage.setItem('atlas_skills_v1', JSON.stringify({
      customSkills: S.skills.customSkills,
      activeSkillId: S.skills.activeSkillId,
      smartAuto: S.skills.smartAuto,
    }));
  } catch(e) {}
}

function getAllSkills() {
  return [...BUILTIN_SKILLS, ...S.skills.customSkills];
}

function getActiveSkill() {
  if (!S.skills.activeSkillId) return null;
  return getAllSkills().find(sk => sk.id === S.skills.activeSkillId) || null;
}

function setActiveSkill(id) {
  S.skills.activeSkillId = id;
  saveSkillsState();
  updateSkillPill();
  renderSkillsModal();
  const btn = document.getElementById('skills-btn');
  if (btn) btn.classList.toggle('skills-active', !!id);
}

function updateSkillPill() {
  const pill = document.getElementById('active-skill-pill');
  const skill = getActiveSkill();
  if (!pill) return;
  if (skill) {
    pill.classList.add('show');
    document.getElementById('pill-icon').textContent = skill.icon;
    document.getElementById('pill-name').textContent = skill.name;
  } else {
    pill.classList.remove('show');
  }
  const btn = document.getElementById('skills-btn');
  if (btn) btn.classList.toggle('skills-active', !!skill);
}

function openSkillsModal() {
  const modal = document.getElementById('skills-modal');
  if (!modal) return;
  
  modal.style.display = 'flex';
  modal.classList.add('open');
  
  const btn = document.getElementById('skills-btn');
  if (btn) btn.classList.add('active');
  
  try { renderSkillsModal(); } catch(e) { console.warn('renderSkillsModal error', e); }
}

function openSkillsModalFromSettings() {
  const skillsModal = document.getElementById('skills-modal');
  if (!skillsModal) return;
  
  skillsModal.style.display = 'flex';
  skillsModal.classList.add('open');
  
  const btn = document.getElementById('skills-btn');
  if (btn) btn.classList.add('active');
  
  try { renderSkillsModal(); } catch(e) { console.warn('renderSkillsModal error', e); }
}

function closeSkillsModal() {
  const modal = document.getElementById('skills-modal');
  if (!modal) return;
  
  modal.style.display = 'none';
  modal.classList.remove('open');
  
  const btn = document.getElementById('skills-btn');
  if (btn) btn.classList.remove('active');
}

// Close on backdrop click
document.addEventListener('click', e => {
  const modal = document.getElementById('skills-modal');
  if (modal && modal.style.display === 'flex' && e.target === modal) {
    closeSkillsModal();
  }
});

function renderSkillsModal() {
  const tog = document.getElementById('skill-auto-toggle');
  if (tog) tog.checked = S.skills.smartAuto;
  const statusEl = document.getElementById('skills-auto-status');
  if (statusEl) statusEl.textContent = S.skills.smartAuto ? '🧠 Auto-detect ON' : '';

  // Builtin grid
  const bg = document.getElementById('builtin-skills-grid');
  if (bg) {
    bg.innerHTML = BUILTIN_SKILLS.map(sk => `
      <div class="skill-card ${S.skills.activeSkillId === sk.id ? 'active-skill' : ''}" onclick="setActiveSkill('${sk.id}')">
        <div class="skill-card-icon">${sk.icon}</div>
        <div class="skill-card-name">${sk.name}</div>
        <div class="skill-card-desc">${sk.desc}</div>
        ${S.skills.activeSkillId === sk.id ? '<span class="skill-card-badge">Active</span>' : ''}
        <button class="skill-edit-btn" onclick="event.stopPropagation();openSkillEdit('${sk.id}','builtin')" title="Edit skill">✏</button>
      </div>`).join('');
  }

  // Custom grid
  const cg = document.getElementById('custom-skills-grid');
  const cs = document.getElementById('custom-skills-section');
  if (cg && cs) {
    if (S.skills.customSkills.length > 0) {
      cs.style.display = '';
      cg.innerHTML = S.skills.customSkills.map(sk => `
        <div class="skill-card ${S.skills.activeSkillId === sk.id ? 'active-skill' : ''}" onclick="setActiveSkill('${sk.id}')">
          <div class="skill-card-icon">${sk.icon || '⚡'}</div>
          <div class="skill-card-name">${esc(sk.name)}</div>
          <div class="skill-card-desc">${esc(sk.desc || sk.prompt.slice(0,80) + '…')}</div>
          ${S.skills.activeSkillId === sk.id ? '<span class="skill-card-badge">Active</span>' : ''}
          <button class="skill-edit-btn" onclick="event.stopPropagation();openSkillEdit('${sk.id}','custom')" title="Edit skill">✏</button>
          <button class="skill-del-btn" onclick="event.stopPropagation();deleteCustomSkill('${sk.id}')" title="Delete skill">🗑</button>
        </div>`).join('');
    } else {
      cs.style.display = 'none';
    }
  }
}

function deleteCustomSkill(id) {
  S.skills.customSkills = S.skills.customSkills.filter(s => s.id !== id);
  if (S.skills.activeSkillId === id) setActiveSkill(null);
  saveSkillsState();
  renderSkillsModal();
}


// ── SKILL EDITOR ──────────────────────────────────────────────────────────

const SKILL_ICONS = ['🎨','💻','📄','🧠','📊','🎭','⚡','🔧','🌐','📝','🔬','🎯','🚀','💡','🛠️','📚','🎵','🎮','🔐','📈'];
const SKILL_OVERRIDES_KEY = 'atlas_skill_overrides_v1';

let _skillEditId = null;
let _skillEditType = null; // 'builtin' | 'custom'
let _skillEditIcon = null;

function loadSkillOverrides() {
  try {
    const raw = localStorage.getItem(SKILL_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function saveSkillOverrides(overrides) {
  try { localStorage.setItem(SKILL_OVERRIDES_KEY, JSON.stringify(overrides)); } catch(e) {}
}

// Apply stored overrides onto BUILTIN_SKILLS at runtime
function getEffectiveBuiltinSkill(sk) {
  const overrides = loadSkillOverrides();
  return overrides[sk.id] ? { ...sk, ...overrides[sk.id] } : sk;
}

// Override getAllSkills so overrides are always applied
const _origGetAllSkills = getAllSkills;
getAllSkills = function() {
  const overrides = loadSkillOverrides();
  const builtins = BUILTIN_SKILLS.map(sk => overrides[sk.id] ? { ...sk, ...overrides[sk.id] } : sk);
  return [...builtins, ...S.skills.customSkills];
};

function openSkillEdit(id, type) {
  _skillEditId = id;
  _skillEditType = type;

  const skill = type === 'builtin'
    ? getAllSkills().find(s => s.id === id)
    : S.skills.customSkills.find(s => s.id === id);

  if (!skill) return;

  // Populate fields
  document.getElementById('skill-edit-title').textContent = type === 'builtin' ? 'Edit Built-in Skill' : 'Edit Skill';
  document.getElementById('skill-edit-name').value = skill.name;
  document.getElementById('skill-edit-desc').value = skill.desc || '';
  document.getElementById('skill-edit-prompt').value = skill.prompt;
  _skillEditIcon = skill.icon || '⚡';

  const hintEl = document.getElementById('skill-edit-hint');
  if (hintEl) hintEl.textContent = type === 'builtin' ? 'Changes override the built-in — reset anytime.' : '';

  // Render icon picker
  const iconRow = document.getElementById('skill-edit-icons');
  if (iconRow) {
    iconRow.innerHTML = SKILL_ICONS.map(ic =>
      `<button class="skill-icon-opt ${ic === _skillEditIcon ? 'selected' : ''}" onclick="selectEditIcon('${ic}')">${ic}</button>`
    ).join('');
  }

  // Show reset button only for builtins that have overrides
  const resetBtn = document.getElementById('skill-reset-btn');
  if (resetBtn) {
    const hasOverride = type === 'builtin' && !!loadSkillOverrides()[id];
    resetBtn.style.display = hasOverride ? '' : 'none';
  }

  // Close skills modal, open edit modal
  document.getElementById('skills-modal').classList.remove('open');
  document.getElementById('skill-edit-modal').classList.add('open');
}

function selectEditIcon(icon) {
  _skillEditIcon = icon;
  document.querySelectorAll('.skill-icon-opt').forEach(btn => {
    btn.classList.toggle('selected', btn.textContent === icon);
  });
}

function closeSkillEdit() {
  document.getElementById('skill-edit-modal').classList.remove('open');
  document.getElementById('skills-modal').classList.add('open');
  _skillEditId = null;
  _skillEditType = null;
}

function saveSkillEdit() {
  const name = document.getElementById('skill-edit-name').value.trim();
  const desc = document.getElementById('skill-edit-desc').value.trim();
  const prompt = document.getElementById('skill-edit-prompt').value.trim();

  if (!name) { toast('Enter a skill name', 'er'); return; }
  if (!prompt) { toast('Enter a system prompt', 'er'); return; }

  if (_skillEditType === 'builtin') {
    const overrides = loadSkillOverrides();
    overrides[_skillEditId] = { name, desc, prompt, icon: _skillEditIcon };
    saveSkillOverrides(overrides);
    toast('✓ Built-in skill updated', 'ok');
  } else {
    const sk = S.skills.customSkills.find(s => s.id === _skillEditId);
    if (sk) {
      sk.name = name;
      sk.desc = desc;
      sk.prompt = prompt;
      sk.icon = _skillEditIcon;
      saveSkillsState();
      toast('✓ Skill saved', 'ok');
    }
  }

  // Update pill if this skill is currently active
  updateSkillPill();
  closeSkillEdit();
  renderSkillsModal();
}

// Backdrop click closes edit modal
document.addEventListener('click', e => {
  const em = document.getElementById('skill-edit-modal');
  if (em && e.target === em) closeSkillEdit();
});

// Add "Reset to default" for builtin skills in the edit footer
const _origSaveSkillEdit = saveSkillEdit;
// Expose reset function
function resetBuiltinSkill() {
  if (_skillEditType !== 'builtin') return;
  const overrides = loadSkillOverrides();
  delete overrides[_skillEditId];
  saveSkillOverrides(overrides);
  toast('✓ Reset to default', 'ok');
  updateSkillPill();
  closeSkillEdit();
  renderSkillsModal();
}

function toggleSmartSkills(val) {
  S.skills.smartAuto = val;
  saveSkillsState();
  const statusEl = document.getElementById('skills-auto-status');
  if (statusEl) statusEl.textContent = val ? '🧠 Auto-detect ON' : '';
}

function switchImportTab(tab, btn) {
  document.querySelectorAll('.simp-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.simp-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('simp-' + tab).style.display = '';
  btn.classList.add('active');
}

async function importSkillFromGithub() {
  let url = document.getElementById('skill-gh-url').value.trim();
  if (!url) { toast('Enter a GitHub URL', 'er'); return; }
  // Convert github.com blob URL to raw
  url = url
    .replace('https://github.com/', 'https://raw.githubusercontent.com/')
    .replace('/blob/', '/');
  try {
    toast('⬇ Fetching skill…', 'ok');
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    // Extract name from URL path (last segment without extension)
    const parts = url.split('/');
    const rawName = parts[parts.length - 1].replace(/\.(md|txt)$/i, '').replace(/[-_]/g, ' ');
    const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    // Strip YAML frontmatter if present
    const body = text.replace(/^---[\s\S]*?---\n?/, '').trim();
    addCustomSkill(name, body, '🔗');
    document.getElementById('skill-gh-url').value = '';
    toast('✓ Skill imported: ' + name, 'ok');
  } catch(e) {
    toast('Fetch failed: ' + e.message, 'er');
  }
}

function importSkillFromPaste() {
  const name = document.getElementById('skill-paste-name').value.trim();
  const body = document.getElementById('skill-paste-body').value.trim();
  if (!name) { toast('Enter a skill name', 'er'); return; }
  if (!body) { toast('Paste skill content', 'er'); return; }
  addCustomSkill(name, body, '📋');
  document.getElementById('skill-paste-name').value = '';
  document.getElementById('skill-paste-body').value = '';
  toast('✓ Skill added: ' + name, 'ok');
}

function importSkillFromFile(input) {
  const file = input.files[0];
  if (!file) return;
  const nameEl = document.getElementById('skill-file-name');
  const autoName = file.name.replace(/\.(md|txt)$/i, '').replace(/[-_]/g, ' ');
  if (!nameEl.value) nameEl.value = autoName.charAt(0).toUpperCase() + autoName.slice(1);
  const reader = new FileReader();
  reader.onload = () => {
    const body = reader.result.replace(/^---[\s\S]*?---\n?/, '').trim();
    const name = nameEl.value || autoName;
    addCustomSkill(name, body, '📁');
    nameEl.value = '';
    input.value = '';
    toast('✓ Skill imported: ' + name, 'ok');
  };
  reader.readAsText(file);
}

function addCustomSkill(name, prompt, icon = '⚡') {
  const id = 'custom_' + Date.now();
  S.skills.customSkills.push({ id, name, prompt, icon, desc: prompt.slice(0, 80) + '…' });
  saveSkillsState();
  renderSkillsModal();
}

// ── SMART AUTO-DETECT ───────────────────────────────────────────────────────
// Sends a lightweight classification call to pick the best skill for a message.

const SKILL_CLASSIFIER_PROMPT = `You are a skill classifier. Given a user message, pick the single best skill ID from this list, or return "none" if no skill fits well.

Skills:
- frontend: UI components, web apps, HTML, CSS, React, design, landing pages, dashboards
- document: reports, essays, memos, letters, proposals, professional writing, documentation
- code: programming, debugging, algorithms, functions, scripts, APIs, code review, technical implementation
- analysis: research, comparisons, reasoning, strategy, critical thinking, pros/cons, frameworks
- data: datasets, statistics, charts, graphs, visualization, trends, metrics, numbers
- creative: stories, fiction, poems, scripts, creative writing, narrative, characters

Respond with ONLY the skill ID or "none". No explanation. Examples: "frontend", "code", "none"`;

let _lastAutoSkillMsgId = null; // avoid double-classifying same message

async function autoDetectSkill(text) {
  if (!S.skills.smartAuto) return;
  // Don't re-classify if manually set and it wasn't auto
  if (!S.skills._lastWasAuto && S.skills.activeSkillId) return;

  const activeKey = S.provider === 'deepseek' ? S.deepseekKey : S.provider === 'gemini' ? S.geminiKey : S.provider === 'openai' ? S.openaiKey : S.provider === 'local' ? (S.localKey || 'local') : S.key;
  if (!activeKey || !S.model) return;

  try {
    let skillId = null;

    if (S.provider === 'gemini') {
      const modelId = S.model.apiId || S.model.id;
      const ep = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(S.geminiKey)}`;
      const body = { contents: [{ role: 'user', parts: [{ text: SKILL_CLASSIFIER_PROMPT + '\n\nUser message: ' + text.slice(0, 400) }] }], generationConfig: { temperature: 0, maxOutputTokens: 10 } };
      const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      skillId = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase() || 'none';
    } else {
      const ep = S.provider === 'deepseek' ? 'https://api.deepseek.com/chat/completions'
               : S.provider === 'local' ? (S.localBaseUrl || 'http://localhost:11434').replace(/\/+$/, '') + '/v1/chat/completions'
               : 'https://openrouter.ai/api/v1/chat/completions';
      const auth = S.provider === 'deepseek' ? S.deepseekKey
                 : S.provider === 'local' ? (S.localKey || 'none')
                 : S.key;
      const modelId = (S.model.apiId || S.model.id).replace(/:(free|nitro|floor|beta)$/, '');
      const body = { model: modelId, messages: [{ role: 'user', content: SKILL_CLASSIFIER_PROMPT + '\n\nUser message: ' + text.slice(0, 400) }], temperature: 0, max_tokens: 10 };
      const headers = { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' };
      if (S.provider !== 'deepseek') { headers['HTTP-Referer'] = location.href.startsWith('http') ? location.href : 'https://atlas.local'; headers['X-Title'] = 'Atlas'; }
      const res = await fetch(ep, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json();
      skillId = data.choices?.[0]?.message?.content?.trim().toLowerCase() || 'none';
    }

    // Validate it's a known skill
    const known = getAllSkills().map(s => s.id);
    if (skillId && skillId !== 'none' && known.includes(skillId)) {
      if (skillId !== S.skills.activeSkillId) {
        S.skills._lastWasAuto = true;
        setActiveSkill(skillId);
        const skill = getActiveSkill();
        if (skill) toast(`✦ Skill: ${skill.icon} ${skill.name}`, 'ok');
      }
    } else if (S.skills._lastWasAuto) {
      // Clear auto-set skill if nothing fits
      S.skills._lastWasAuto = false;
      setActiveSkill(null);
    }
  } catch(e) {
    // Silent fail — don't block the main message
    console.warn('Skill classifier failed:', e.message);
  }
}

// Get the active skill's system prompt to inject
function getSkillSystemPrompt() {
  const skill = getActiveSkill();
  return skill ? skill.prompt : '';
}

// Called on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(loadSkillsState, 100);
});


// ── OUTPUT FORMAT SYSTEM ──────────────────────────────────────────────────
// Tracks active output format mode (null | 'pdf' | 'docx' | 'pptx' | 'css')
S.outputFmt = null;

const OUTPUT_FMT_CONFIG = {
  pdf: {
    label: '📄 PDF',
    activeClass: 'active-pdf',
    tag: 'pdf-content',
    ext: 'pdf',
    emoji: '📄',
    schemaSummary: 'JSON with {title, author?, sections:[{heading,body,bullet_points?[]}], footer?}',
    systemPrompt: `IMPORTANT: The user wants a PDF document. You MUST respond with ONLY a fenced \`\`\`pdf-content block containing valid JSON. Do NOT write markdown. Do NOT write prose. Do NOT use any other code block. The ONLY output must be:
\`\`\`pdf-content
{
  "title": "Document Title",
  "author": "Optional Author",
  "sections": [
    { "heading": "Section Title", "body": "Paragraph text here.", "bullet_points": ["optional","list","items"] }
  ],
  "footer": "Optional footer text"
}
\`\`\`
No other text before or after. JSON only inside the block.`
  },
  docx: {
    label: '📝 Word',
    activeClass: 'active-docx',
    tag: 'docx-content',
    ext: 'docx',
    emoji: '📝',
    schemaSummary: 'JSON with {title, sections:[{heading?,body,bullet_points?[]}]}',
    systemPrompt: `IMPORTANT: The user wants a Word document. You MUST respond with ONLY a fenced \`\`\`docx-content block containing valid JSON. Do NOT write markdown. Do NOT write prose. Do NOT use any other code block. The ONLY output must be:
\`\`\`docx-content
{
  "title": "Document Title",
  "sections": [
    { "heading": "Optional Section Heading", "body": "Paragraph text.", "bullet_points": ["optional","items"] }
  ]
}
\`\`\`
No other text before or after. JSON only inside the block.`
  },
  pptx: {
    label: '📊 PowerPoint',
    activeClass: 'active-pptx',
    tag: 'pptx-content',
    ext: 'pptx',
    emoji: '📊',
    schemaSummary: 'JSON with {title, slides:[{title,body?,bullets?[],notes?}]}',
    systemPrompt: `IMPORTANT: The user wants a PowerPoint presentation. You MUST respond with ONLY a fenced \`\`\`pptx-content block containing valid JSON. Do NOT write markdown. Do NOT write prose. Do NOT use any other code block. The ONLY output must be:
\`\`\`pptx-content
{
  "title": "Presentation Title",
  "slides": [
    { "title": "Slide Title", "body": "Optional subtitle or body text", "bullets": ["Bullet point 1","Bullet point 2"], "notes": "Optional speaker notes" }
  ]
}
\`\`\`
No other text before or after. JSON only inside the block.`
  },
  css: {
    label: '🖌️ CSS',
    activeClass: 'active-css',
    tag: 'css',
    ext: 'css',
    emoji: '🖌️',
    schemaSummary: 'Standard CSS code',
    systemPrompt: `When the user asks for CSS, output it in a fenced \`\`\`css code block. The user can download it directly as a .css file. Write complete, well-structured CSS.`
  }
};

function toggleFmtBar() {
  const bar = document.getElementById('fmt-bar');
  const btn = document.getElementById('fmt-btn');
  if (!bar.classList.contains('hidden')) {
    bar.classList.add('hidden');
    btn.classList.remove('active');
    btn.style.color = '';
    S.outputFmt = null;
    return;
  }
  bar.classList.remove('hidden');
  btn.classList.add('active');
  renderFmtBar();
}

function renderFmtBar() {
  const bar = document.getElementById('fmt-bar');
  const fmts = Object.entries(OUTPUT_FMT_CONFIG);
  bar.innerHTML = `<span class="fmt-label">Output as:</span>` +
    fmts.map(([key, cfg]) =>
      `<button class="fmt-chip ${S.outputFmt === key ? cfg.activeClass : ''}" onclick="setOutputFmt('${key}')">${cfg.label}</button>`
    ).join('') +
    `<button class="fmt-close" onclick="toggleFmtBar()" title="Close">✕</button>`;
}

function setOutputFmt(fmt) {
  S.outputFmt = fmt;
  renderFmtBar();
  const btn = document.getElementById('fmt-btn');
  if (fmt) {
    btn.classList.add('active');
    btn.style.color = fmt === 'pdf' ? '#ff5f6d' : fmt === 'docx' ? '#4a6fdf' : fmt === 'pptx' ? '#f57823' : 'var(--grn)';
    toast(`${OUTPUT_FMT_CONFIG[fmt].emoji} Output mode: ${OUTPUT_FMT_CONFIG[fmt].label}`, 'ok');
  } else {
    btn.style.color = '';
  }
}

// Keyword detection — scans user message for file output intent
function detectOutputFmt(text) {
  const t = text.toLowerCase();
  if (/\b(pdf|portable document)\b/.test(t) && /\b(make|create|generate|write|build|produce)\b/.test(t)) return 'pdf';
  if (/\b(word|docx|word doc|word document|\.docx)\b/.test(t) && /\b(make|create|generate|write|build|produce)\b/.test(t)) return 'docx';
  // Generic document requests → docx
  if (/\b(document|report|essay|letter|memo|brief|article|proposal|resume|cv|cover letter)\b/.test(t) && /\b(make|create|generate|write|build|produce|draft)\b/.test(t)) return 'docx';
  if (/\b(powerpoint|pptx|presentation|slide deck|slides|\.pptx)\b/.test(t) && /\b(make|create|generate|write|build|produce)\b/.test(t)) return 'pptx';
  if (/\b(css|stylesheet|style sheet)\b/.test(t) && /\b(make|create|generate|write|build|produce)\b/.test(t)) return 'css';
  return null;
}

// Build the system prompt addendum for file output
function buildFmtSystemPrompt(fmt) {
  return OUTPUT_FMT_CONFIG[fmt]?.systemPrompt || '';
}

// ── FILE GENERATORS ───────────────────────────────────────────────────────

// Lazy-load a script from CDN
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Failed to load: ' + src));
    document.head.appendChild(s);
  });
}

// Robustly parse JSON from model output — strips markdown fences, leading/trailing text
function parseModelJSON(raw) {
  let s = raw.trim();
  // Strip any accidental ``` fences the model added inside the block
  s = s.replace(/^```[\w-]*\n?/, '').replace(/```$/, '').trim();
  // Find first { and last } to extract just the JSON object
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in model output');
  return JSON.parse(s.slice(start, end + 1));
}

async function generatePDF(jsonStr, filename) {
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    const { jsPDF } = window.jspdf;
    const data = parseModelJSON(jsonStr);

    // Use current page setup settings - always prefer global _vePageSetup if missing
    const globalPs = (typeof _vePageSetup !== 'undefined') ? _vePageSetup : { size:'A4', orient:'portrait', mt:25, mb:25, ml:25, mr:25, pgnum:'none' };
    const ps = data._pageSetup || globalPs;
    const fmtMap = { A4:'a4', Letter:[216,279], Legal:[216,356], A3:'a3', A5:'a5' };
    const fmt = fmtMap[ps.size] || 'a4';
    const doc = new jsPDF({ unit: 'mm', format: fmt, orientation: ps.orient });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const ML = ps.ml, MR = ps.mr, MT = ps.mt, MB = ps.mb;
    const lw = pageW - ML - MR;
    let y = MT;
    const checkPage = (need = 10) => { if (y + need > pageH - MB) { doc.addPage(); y = MT; } };

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(30, 30, 60);
    const titleLines = doc.splitTextToSize(data.title || 'Document', lw);
    doc.text(titleLines, ML, y);
    y += titleLines.length * 9 + 2;

    // Author
    if (data.author) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 130);
      doc.text(data.author, ML, y);
      y += 7;
    }

    // Divider
    doc.setDrawColor(180, 160, 255);
    doc.setLineWidth(0.5);
    doc.line(ML, y, PW - MR, y);
    y += 7;

    // Sections
    for (const sec of (data.sections || [])) {
      checkPage(14);
      if (sec.heading) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(60, 50, 140);
        const hLines = doc.splitTextToSize(sec.heading, lw);
        doc.text(hLines, ML, y);
        y += hLines.length * 7 + 2;
      }
      if (sec.body) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(40, 40, 55);
        const bLines = doc.splitTextToSize(sec.body, lw);
        bLines.forEach(line => { checkPage(6); doc.text(line, ML, y); y += 6; });
        y += 2;
      }
      if (sec.bullet_points?.length) {
        doc.setFontSize(11);
        doc.setTextColor(40, 40, 55);
        for (const bp of sec.bullet_points) {
          checkPage(6);
          const bpLines = doc.splitTextToSize('• ' + bp, lw - 6);
          bpLines.forEach((ln, i) => { doc.text(ln, ML + (i > 0 ? 5 : 3), y); y += 6; });
        }
        y += 2;
      }
      y += 4;
    }

    // Footer + page numbers
    const pageCount = doc.internal.getNumberOfPages();
    const showPgNum = ps.pgnum && ps.pgnum !== 'none';
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(160, 160, 180);
      if (data.footer) doc.text(data.footer, ML, pageH - (MB / 2));
      if (showPgNum) {
        const isTop   = (ps.pgnum || '').startsWith('top');
        const isRight = (ps.pgnum || '').includes('right');
        const pgY  = isTop ? MT / 2 : pageH - (MB / 2);
        const pgX  = isRight ? pageW - MR : pageW / 2;
        doc.text(`Page ${i} of ${pageCount}`, pgX, pgY, { align: isRight ? 'right' : 'center' });
      }
    }

    doc.save(filename || 'document.pdf');
    toast('📄 PDF downloaded!', 'ok');
  } catch(e) {
    toast('PDF generation failed: ' + e.message, 'er');
    console.error(e);
  }
}

async function generateDOCX(jsonStr, filename) {
  try {
    await loadScript('https://unpkg.com/docx@8.2.2/build/index.umd.js');
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
            Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun,
            UnderlineType, ShadingType, Footer, Header, PageNumber } = window.docx;

    let data;
    try { data = parseModelJSON(jsonStr); } catch(e) { data = {}; }

    const children = [];

    // ── Helper: convert a DOM node tree → docx Paragraph/Table children ──
    function styleRuns(el) {
      // Recursively collect TextRuns with inline styles from a DOM element
      const runs = [];
      function walk(node, bold, italic, underline, strike, color, size) {
        if (node.nodeType === Node.TEXT_NODE) {
          const t = node.textContent;
          if (!t) return;
          const run = { text: t };
          if (bold)      run.bold = true;
          if (italic)    run.italics = true;
          if (underline) run.underline = { type: UnderlineType.SINGLE };
          if (strike)    run.strike = true;
          if (color)     run.color = color.replace('#','');
          if (size)      run.size  = size;
          runs.push(new TextRun(run));
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag  = node.tagName.toLowerCase();
        const cs   = window.getComputedStyle ? null : null; // inline only
        const st   = node.style || {};
        const nb   = bold   || tag === 'b' || tag === 'strong' || st.fontWeight === 'bold' || parseInt(st.fontWeight) >= 700;
        const ni   = italic || tag === 'i' || tag === 'em'     || st.fontStyle === 'italic';
        const nu   = underline || tag === 'u' || (st.textDecoration||'').includes('underline');
        const ns   = strike    || tag === 's' || tag === 'strike' || tag === 'del' || (st.textDecoration||'').includes('line-through');
        const nc   = st.color  ? rgbToHex(st.color)  : color;
        const nz   = st.fontSize ? Math.round(parseFloat(st.fontSize) * 2) : size; // half-points
        if (tag === 'br') { runs.push(new TextRun({ text: '', break: 1 })); return; }
        for (const child of node.childNodes) walk(child, nb, ni, nu, ns, nc, nz);
      }
      walk(el, false, false, false, false, null, null);
      return runs;
    }

    function rgbToHex(rgb) {
      if (!rgb || rgb === 'inherit') return null;
      if (rgb.startsWith('#')) return rgb.replace('#','');
      const m = rgb.match(/\d+/g);
      if (!m || m.length < 3) return null;
      return m.slice(0,3).map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
    }

    function alignFromStyle(el) {
      const ta = (el.style?.textAlign || '').toLowerCase();
      if (ta === 'center') return AlignmentType.CENTER;
      if (ta === 'right')  return AlignmentType.RIGHT;
      if (ta === 'justify') return AlignmentType.BOTH;
      return AlignmentType.LEFT;
    }

    function nodeToChildren(el) {
      const out = [];
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const t = node.textContent.trim();
          if (t) out.push(new Paragraph({ children: [new TextRun(t)], spacing: { after: 120 } }));
          continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = node.tagName.toLowerCase();

        if (tag === 'h1') {
          out.push(new Paragraph({ children: styleRuns(node), heading: HeadingLevel.HEADING_1, alignment: alignFromStyle(node), spacing: { before: 300, after: 120 } }));
        } else if (tag === 'h2') {
          out.push(new Paragraph({ children: styleRuns(node), heading: HeadingLevel.HEADING_2, alignment: alignFromStyle(node), spacing: { before: 240, after: 100 } }));
        } else if (tag === 'h3') {
          out.push(new Paragraph({ children: styleRuns(node), heading: HeadingLevel.HEADING_3, alignment: alignFromStyle(node), spacing: { before: 200, after: 80 } }));
        } else if (tag === 'p' || tag === 'div') {
          const runs = styleRuns(node);
          if (runs.length) out.push(new Paragraph({ children: runs, alignment: alignFromStyle(node), spacing: { after: 120 } }));
          else out.push(...nodeToChildren(node));  // recurse for wrapper divs
        } else if (tag === 'ul' || tag === 'ol') {
          let idx = 0;
          for (const li of node.querySelectorAll(':scope > li')) {
            const runs = styleRuns(li);
            if (tag === 'ol') {
              out.push(new Paragraph({ children: [new TextRun(`${++idx}. `), ...runs], spacing: { after: 80 } }));
            } else {
              out.push(new Paragraph({ children: runs, bullet: { level: 0 }, spacing: { after: 80 } }));
            }
          }
        } else if (tag === 'li') {
          out.push(new Paragraph({ children: styleRuns(node), bullet: { level: 0 }, spacing: { after: 80 } }));
        } else if (tag === 'br') {
          out.push(new Paragraph({ children: [new TextRun('')] }));
        } else if (tag === 'hr') {
          out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA' } }, children: [new TextRun('')] }));
        } else if (tag === 'table') {
          const rows = [];
          for (const tr of node.querySelectorAll('tr')) {
            const cells = [];
            for (const td of tr.querySelectorAll('td, th')) {
              const isHeader = td.tagName.toLowerCase() === 'th';
              const cellChildren = nodeToChildren(td);
              if (!cellChildren.length) cellChildren.push(new Paragraph({ children: [new TextRun('')] }));
              cells.push(new TableCell({
                children: cellChildren,
                shading: isHeader ? { type: ShadingType.SOLID, color: 'E8EEF6', fill: 'E8EEF6' } : undefined,
                margins: { top: 80, bottom: 80, left: 120, right: 120 }
              }));
            }
            if (cells.length) rows.push(new TableRow({ children: cells }));
          }
          if (rows.length) {
            out.push(new Table({
              rows,
              width: { size: 9000, type: WidthType.DXA },
              margins: { top: 120, bottom: 120 }
            }));
            out.push(new Paragraph({ children: [new TextRun('')] })); // spacing after table
          }
        } else if (tag === 'img') {
          try {
            const src = node.getAttribute('src') || node.src || '';
            if (src.startsWith('data:')) {
              const [header, b64] = src.split(',');
              const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
              const type = mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : 'jpg';
              const binStr = atob(b64);
              const bytes = new Uint8Array(binStr.length);
              for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
              const w = node.naturalWidth  || node.width  || 400;
              const h = node.naturalHeight || node.height || 300;
              // Scale to max 500pt wide
              const scale = Math.min(1, 500 / w);
              out.push(new Paragraph({
                children: [new ImageRun({ data: bytes.buffer, transformation: { width: Math.round(w * scale), height: Math.round(h * scale) }, type })],
                spacing: { after: 120 }
              }));
            }
          } catch(imgErr) { console.warn('Image embed failed:', imgErr); }
        } else if (tag === 'blockquote') {
          const runs = styleRuns(node);
          out.push(new Paragraph({ children: [new TextRun({ text: '' }), ...runs], indent: { left: 720 }, spacing: { after: 120 }, border: { left: { style: BorderStyle.SINGLE, size: 6, color: '888888', space: 8 } } }));
        } else {
          // fallback: treat as paragraph
          const runs = styleRuns(node);
          if (runs.length) out.push(new Paragraph({ children: runs, spacing: { after: 80 } }));
        }
      }
      return out;
    }

    // ── Route: edited HTML path (_docxHtml present) ──────────────────────
    if (data._docxHtml) {
      const tmp = document.createElement('div');
      tmp.innerHTML = data._docxHtml;
      // Strip page-break divs (they're visual only)
      tmp.querySelectorAll('.ve-page-break').forEach(el => el.remove());
      children.push(...nodeToChildren(tmp));

    // ── Route: original AI JSON structure ────────────────────────────────
    } else {
      children.push(new Paragraph({
        text: data.title || 'Document',
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 }
      }));
      if (data.author) {
        children.push(new Paragraph({
          children: [new TextRun({ text: data.author, italics: true, color: '666688' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        }));
      }
      for (const sec of (data.sections || [])) {
        if (sec.heading) children.push(new Paragraph({ text: sec.heading, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 } }));
        if (sec.body)    children.push(new Paragraph({ children: [new TextRun({ text: sec.body, size: 24 })], spacing: { after: 160 } }));
        if (sec.bullet_points?.length) sec.bullet_points.forEach(bp => children.push(new Paragraph({ children: [new TextRun({ text: bp, size: 24 })], bullet: { level: 0 }, spacing: { after: 80 } })));
      }
      if (data.footer) {
        children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'DDDDDD' } }, children: [new TextRun('')] }));
        children.push(new Paragraph({ children: [new TextRun({ text: data.footer, italics: true, color: '888888', size: 20 })], spacing: { before: 200 } }));
      }
    }

    if (!children.length) children.push(new Paragraph({ children: [new TextRun('')] }));

    // Apply current page setup settings (size, orientation, margins, page numbers)
    // Always prefer global _vePageSetup if data._pageSetup is missing
    const globalPs = (typeof _vePageSetup !== 'undefined') ? _vePageSetup : { size:'A4', orient:'portrait', mt:25, mb:25, ml:25, mr:25, pgnum:'none', cols:1 };
    const ps = data._pageSetup || globalPs;
    const dims = { A4:{w:210,h:297}, Letter:{w:216,h:279}, Legal:{w:216,h:356}, A3:{w:297,h:420}, A5:{w:148,h:210} };
    const d    = dims[ps.size] || dims.A4;
    const isLand = ps.orient === 'landscape';
    const pageW  = isLand ? d.h : d.w; // mm
    const pageH  = isLand ? d.w : d.h;
    // docx uses twips (1 inch = 1440 twips; 1 mm = 56.69 twips)
    const MM_TO_TWIP = 56.69;
    const sectionProps = {
      page: {
        size: { width: Math.round(pageW * MM_TO_TWIP), height: Math.round(pageH * MM_TO_TWIP) },
        margin: {
          top:    Math.round(ps.mt * MM_TO_TWIP),
          bottom: Math.round(ps.mb * MM_TO_TWIP),
          left:   Math.round(ps.ml * MM_TO_TWIP),
          right:  Math.round(ps.mr * MM_TO_TWIP),
        },
      },
    };
    // Add page numbers if requested
    if (ps.pgnum && ps.pgnum !== 'none') {
      const [vpos, halign] = ps.pgnum.split('-');
      const align = halign === 'right' ? AlignmentType.RIGHT : AlignmentType.CENTER;
      const pgNumPara = new Paragraph({
        alignment: align,
        children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 18, color: '888888' })],
      });
      if (vpos === 'bottom') {
        sectionProps.footers = { default: new Footer({ children: [pgNumPara] }) };
      } else {
        sectionProps.headers = { default: new Header({ children: [pgNumPara] }) };
      }
    }

    const doc = new Document({ sections: [{ properties: sectionProps, children }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'document.docx'; a.click();
    URL.revokeObjectURL(url);
    toast('📝 Word doc downloaded!', 'ok');
  } catch(e) {
    toast('DOCX generation failed: ' + e.message, 'er');
    console.error(e);
  }
}

async function generatePPTX(jsonStr, filename) {
  try {
    // pptxgenjs — use unpkg for reliable versioned bundle
    await loadScript('https://unpkg.com/pptxgenjs@3.12.0/dist/pptxgen.bundle.js');
    const data = parseModelJSON(jsonStr);
    
    // Use current page setup settings - columns from _vePageSetup if available
    const globalPs = (typeof _vePageSetup !== 'undefined') ? _vePageSetup : { size:'A4', orient:'portrait', mt:25, mb:25, ml:25, mr:25, pgnum:'none', cols:1 };
    const ps = data._pageSetup || globalPs;
    
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.title = data.title || 'Presentation';

    const THEME = {
      bg: '0e0e18', accent: '7c6aff', text: 'e6e6f0',
      sub: '8888aa', head: 'b06aff'
    };

    for (let i = 0; i < (data.slides || []).length; i++) {
      const sd = data.slides[i];
      const slide = pptx.addSlide();
      slide.background = { color: THEME.bg };

      // Per-slide formatting — use saved values or fall back to defaults
      const fontFace   = sd.fontFamily ? sd.fontFamily.replace(/['"]/g, '').split(',')[0].trim() : 'Calibri';
      const titleSz    = sd.titleSize  ? parseInt(sd.titleSize)  : (i === 0 ? 36 : 28);
      const titleClr   = sd.titleColor ? sd.titleColor.replace('#','') : (i === 0 ? THEME.head : THEME.text);
      const bodyClr    = sd.bodyColor  ? sd.bodyColor.replace('#','')  : THEME.sub;
      const isBold     = sd.bold     || false;
      const isItalic   = sd.italic   || false;
      const isUnderline= sd.underline|| false;
      const align      = sd.align === 'center' ? 'center' : sd.align === 'right' ? 'right' : 'left';

      // Transitions are injected via JSZip post-processing in _injectPptxTransitions()

      // Accent bar at top
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: THEME.accent } });

      // Title
      slide.addText(sd.title || '', {
        x: 0.5, y: 0.2, w: '90%', h: 1.0,
        fontSize: titleSz, bold: isBold, italic: isItalic, underline: isUnderline,
        color: titleClr,
        fontFace, align
      });

      // Body subtitle
      if (sd.body) {
        slide.addText(sd.body, {
          x: 0.5, y: i === 0 ? 1.5 : 1.3, w: '90%', h: 0.6,
          fontSize: 16, color: bodyClr, fontFace, italic: isItalic, align
        });
      }

      // Bullet points
      if (sd.bullets?.length) {
        const bulletObjs = sd.bullets.map(b => ({
          text: b,
          options: { bullet: { type: 'bullet' }, color: bodyClr, fontSize: 18, fontFace, breakLine: true, align }
        }));
        slide.addText(bulletObjs, {
          x: 0.6, y: sd.body ? 2.2 : 1.5, w: '88%', h: 3.5,
          color: bodyClr
        });
      }

      // Speaker notes
      if (sd.notes) slide.addNotes(sd.notes);

      // Slide number
      slide.addText(String(i + 1), {
        x: '90%', y: '92%', w: 0.6, h: 0.3,
        fontSize: 9, color: THEME.sub, align: 'right'
      });
    }

    // Write to ArrayBuffer so we can inject transition XML via JSZip
    const ab = await pptx.write('arraybuffer');
    const finalBlob = await _injectPptxTransitions(ab, data.slides || []);
    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'presentation.pptx'; a.click();
    URL.revokeObjectURL(url);
    toast('📊 PowerPoint downloaded!', 'ok');
  } catch(e) {
    toast('PPTX generation failed: ' + e.message, 'er');
    console.error(e);
  }
}

// Inject <p:transition> XML into each slide using JSZip (pptxgenjs v3 doesn't expose this)
async function _injectPptxTransitions(ab, slidesData) {
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const zip = await JSZip.loadAsync(ab);
    for (let i = 0; i < slidesData.length; i++) {
      const sd = slidesData[i];
      const trans = sd.transition || 'none';
      if (trans === 'none') continue;
      const slidePath = `ppt/slides/slide${i + 1}.xml`;
      const slideFile = zip.file(slidePath);
      if (!slideFile) continue;
      let xml = await slideFile.async('string');
      // Build the <p:transition> XML element
      let transXml = '';
      if (trans === 'fade')  transXml = '<p:transition spd="med" advClick="1"><p:fade/></p:transition>';
      else if (trans === 'slide') transXml = '<p:transition spd="med" advClick="1"><p:push dir="l"/></p:transition>';
      else if (trans === 'zoom')  transXml = '<p:transition spd="med" advClick="1"><p:zoom dir="in"/></p:transition>';
      if (!transXml) continue;
      // Remove any existing transition element
      xml = xml.replace(/<p:transition[\s\S]*?<\/p:transition>/g, '');
      // Insert before </p:sld>
      xml = xml.replace('</p:sld>', transXml + '</p:sld>');
      zip.file(slidePath, xml);
    }
    return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  } catch(e) {
    // If JSZip fails, return original blob unmodified
    console.warn('Transition injection failed:', e);
    return new Blob([ab], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }
}

// ── TOOL DEFINITIONS ──────────────────────────────────────────────────────
function initToolDefinitions() {
  S.toolDefinitions = [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web for current information. Use this when you need up-to-date facts or recent news.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query' },
            num_results: { type: 'integer', description: 'Number of results to return (1-10)', default: 5 }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'calculator',
        description: 'Evaluate a mathematical expression. Supports +, -, *, /, ^, sqrt, sin, cos, tan, log, abs, and parentheses.',
        parameters: {
          type: 'object',
          properties: {
            expression: { type: 'string', description: 'The math expression to evaluate, e.g. "2 + 2 * 3"' }
          },
          required: ['expression']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_current_time',
        description: 'Get the current date and time for a specific timezone.',
        parameters: {
          type: 'object',
          properties: {
            timezone: { type: 'string', description: 'IANA timezone name, e.g. "America/New_York", "Europe/London", "Asia/Tokyo". Leave empty for local time.', default: '' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'generate_image',
        description: 'Generate an image from a text description using DALL-E or other image models.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Detailed image description' },
            size: { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'], description: 'Image dimensions' }
          },
          required: ['prompt']
        }
      }
    }
  ];
}

// ── TOOL EXECUTION ────────────────────────────────────────────────────────
async function executeToolCall(toolCall) {
  const { name, arguments: argsStr, id } = toolCall;
  let args;
  if (argsStr && typeof argsStr === 'object') {
    // Some providers pass a pre-parsed object rather than a JSON string
    args = argsStr;
  } else {
    try {
      args = JSON.parse(argsStr || '{}');
    } catch(e) {
      console.warn('executeToolCall: failed to parse arguments for tool "' + name + '":', e.message, '| raw:', argsStr);
      // Return a structured error instead of silently running the tool with empty args
      return { error: 'Invalid tool arguments (JSON parse failed): ' + e.message, raw_arguments: argsStr };
    }
  }
  
  switch(name) {
    case 'web_search':
      return await executeWebSearch(args);
    case 'calculator':
      return executeCalculator(args);
    case 'get_current_time':
      return executeGetCurrentTime(args);
    case 'generate_image':
      return await executeGenerateImageTool(args);
    default: {
      // Try Google connector tools
      const googleResult = await _executeGoogleTool(name, typeof toolCall.arguments === 'string' ? toolCall.arguments : JSON.stringify(args));
      if (googleResult !== null) return googleResult;
      return { error: `Unknown tool: ${name}` };
    }
  }
}

async function executeWebSearch(args) {
  try {
    const query = args.query || '';
    const num = Math.min(args.num_results || 5, 10);
    // DuckDuckGo's JSON API blocks direct browser requests via CORS.
    // Route through allorigins.win, a public CORS proxy, to fetch the
    // Instant Answer API response without a dedicated backend.
    const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('Proxy request failed: HTTP ' + res.status);
    const wrapper = await res.json();
    const data = JSON.parse(wrapper.contents || '{}');
    let results = [];
    if (data.AbstractText) {
      results.push({ title: data.Heading || 'Result', snippet: data.AbstractText, url: data.AbstractURL || '' });
    }
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      data.RelatedTopics.slice(0, num - results.length).forEach(t => {
        if (t.Text) results.push({ title: t.FirstURL || '', snippet: t.Text, url: t.FirstURL || '' });
      });
    }
    if (results.length === 0) {
      results.push({ title: 'No results', snippet: 'No information found for this query.', url: '' });
    }
    return { query: args.query, results: results.slice(0, num) };
  } catch(e) {
    return { error: 'Search failed: ' + e.message };
  }
}

function executeCalculator(args) {
  try {
    const expr = args.expression || '';
    // Map common math names to Math.* equivalents, then whitelist the result
    const mapped = expr
      .replace(/\bsqrt\b/gi, 'Math.sqrt')
      .replace(/\bsin\b/gi,  'Math.sin')
      .replace(/\bcos\b/gi,  'Math.cos')
      .replace(/\btan\b/gi,  'Math.tan')
      .replace(/\blog\b/gi,  'Math.log')
      .replace(/\blog10\b/gi,'Math.log10')
      .replace(/\babs\b/gi,  'Math.abs')
      .replace(/\bpi\b/gi,   'Math.PI')
      .replace(/\be\b/gi,    'Math.E')
      .replace(/\bpow\b/gi,  'Math.pow')
      .replace(/\bfloor\b/gi,'Math.floor')
      .replace(/\bceil\b/gi, 'Math.ceil')
      .replace(/\bround\b/gi,'Math.round');
    // Whitelist: digits, operators, parens, dots, spaces, Math.* identifiers
    const sanitized = mapped.replace(/[^0-9+\-*/().%\s,](?<!Math\.[a-zA-Z]+)/g, ch => {
      // Allow characters that are part of "Math." references
      return '';
    });
    // Safer: only allow the mapped expression through if it contains nothing but
    // numbers, operators, parens, commas, and Math.* calls
    if (!/^[\d\s+\-*/().%,]*(Math\.[a-zA-Z]+[\d\s+\-*/().%,]*)*$/.test(mapped)) {
      // Fall back to a simple whitelist strip for the mapped string
      const strict = mapped.replace(/[^0-9+\-*/().%,\sMath\.a-zA-Z]/g, '');
      const result = Function('"use strict"; return (' + strict + ')')();
      return { expression: expr, result: result };
    }
    const result = Function('"use strict"; return (' + mapped + ')')();
    return { expression: expr, result: result };
  } catch(e) {
    return { error: 'Calculation failed: ' + e.message, expression: args.expression };
  }
}

function executeGetCurrentTime(args) {
  try {
    const tz = args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();
    const formatted = now.toLocaleString('en-US', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' });
    return { timezone: tz, datetime: now.toISOString(), formatted: formatted };
  } catch(e) {
    return { error: 'Invalid timezone: ' + e.message };
  }
}

async function executeGenerateImageTool(args) {
  return await generateImage(args.prompt, args.size || '1024x1024');
}

// ── IMAGE GENERATION ──────────────────────────────────────────────────────
async function generateImage(prompt, size) {
  if (!S.key) { toast('Please add an API key first', 'er'); return { error: 'No API key' }; }
  
  const imgSize = size || S.cfg.imgSize || '1024x1024';
  
  // Determine which image model to use
  let imgModel = S.cfg.imgModel || '';
  
  // If in image gen mode with a compatible model, use it
  if (!imgModel && S.model && IMAGE_GEN_MODELS.some(m => S.model.id.includes(m.split('/')[1]) || S.model.id === m)) {
    imgModel = S.model.id;
  }
  
  // Default to DALL-E 3
  if (!imgModel) {
    imgModel = 'openai/dall-e-3';
  }
  
  try {
    const baseId = imgModel.replace(/:(free|nitro|floor|beta)$/, '');
    const isDalle = baseId.includes('dall-e');
    
    let requestBody;
    if (isDalle) {
      // DALL-E uses the standard images/generations endpoint
      requestBody = {
        model: baseId,
        prompt: prompt,
        n: 1,
        size: imgSize,
      };
    } else {
      // Other models via chat completions with image output
      // Some use different params, but we'll try with a standard format
      requestBody = {
        model: baseId,
        prompt: prompt,
        size: imgSize,
        n: 1,
      };
    }
    
    const endpoint = isDalle
      ? 'https://openrouter.ai/api/v1/images/generations'
      : 'https://openrouter.ai/api/v1/chat/completions';
    
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${S.key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': location.href.startsWith('http') ? location.href : 'https://nexus-or.local',
        'X-Title': 'Atlas',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData.error?.message || `HTTP ${res.status}`;
      return { error: errMsg };
    }
    
    const data = await res.json();
    const images = [];
    
    // Handle different response formats
    if (data.data && Array.isArray(data.data)) {
      data.data.forEach(item => {
        if (item.url) images.push({ url: item.url, b64: item.b64_json || null, revised_prompt: item.revised_prompt || null });
        else if (item.b64_json) images.push({ url: null, b64: item.b64_json, revised_prompt: item.revised_prompt || null });
      });
    }
    
    if (images.length === 0) {
      return { error: 'No images in response', raw: data };
    }
    
    // Estimate cost (DALL-E 3: ~$0.04/image for standard quality 1024x1024)
    const costEstimate = (baseId.includes('dall-e-3') ? 0.04 : 0.02);
    S.totalCost += costEstimate;
    updateCostDisplay();
    
    return { 
      images: images, 
      model: imgModel, 
      prompt: prompt,
      size: imgSize,
      revised_prompt: images[0]?.revised_prompt || null
    };
  } catch(e) {
    return { error: 'Image generation failed: ' + e.message };
  }
}

function toggleWebSearch() {
  S.webSearchMode = !S.webSearchMode;
  const btn = document.getElementById('web-search-btn');
  if (S.webSearchMode) {
    btn.classList.add('active');
    toast('🌐 Web search ON', 'ok');
  } else {
    btn.classList.remove('active');
    toast('🌐 Web search OFF', 'ok');
  }
}

function toggleImageGen() {
  S.imageGenMode = !S.imageGenMode;
  const btn = document.getElementById('image-gen-btn');
  if (S.imageGenMode) {
    btn.classList.add('active');
    document.getElementById('user-input').placeholder = 'Describe the image you want to generate…';
    toast('🖼️ Image generation mode ON', 'ok');
  } else {
    btn.classList.remove('active');
    document.getElementById('user-input').placeholder = 'Message Atlas…';
    toast('💬 Chat mode', 'ok');
  }
}

// ── RENDER IMAGE IN CHAT ──────────────────────────────────────────────────
function renderImageResult(images, prompt, revisedPrompt) {
  let html = '<div class="img-gen-result">';
  images.forEach(img => {
    const src = img.url || (img.b64 ? `data:image/png;base64,${img.b64}` : '');
    if (src) {
      html += `<img src="${esc(src)}" alt="${esc(prompt || '')}" onclick="window.open('${esc(src)}','_blank')" title="Click to open full size">`;
    }
  });
  html += '</div>';
  if (revisedPrompt && revisedPrompt !== prompt) {
    html += `<div style="font-size:11px;color:var(--tx3);margin-top:4px"><em>DALL-E revised prompt:</em> ${esc(revisedPrompt)}</div>`;
  }
  return html;
}

// ── RENDER TOOL CALL IN CHAT ──────────────────────────────────────────────
function renderToolCall(toolCall, result, status) {
  const iconMap = {
    web_search: '🔍',
    calculator: '🧮',
    get_current_time: '🕐',
    generate_image: '🖼️'
  };
  const icon = iconMap[toolCall.function?.name] || '🔧';
  const name = toolCall.function?.name || 'unknown';
  const args = toolCall.function?.arguments || '{}';
  let argsDisplay;
  try { argsDisplay = JSON.stringify(JSON.parse(args), null, 2); } catch { argsDisplay = args; }
  
  const statusClass = status === 'done' ? 'done' : status === 'error' ? 'error' : 'pending';
  const statusText = status === 'done' ? '✓ Done' : status === 'error' ? '✕ Error' : '⏳ Pending';
  
  let resultHtml = '';
  if (result) {
    if (name === 'generate_image' && result.images) {
      resultHtml = renderImageResult(result.images, result.prompt, result.revised_prompt);
    } else {
      resultHtml = `<div style="font-size:11px;color:var(--grn);margin-top:4px">${esc(typeof result === 'string' ? result : JSON.stringify(result, null, 2))}</div>`;
    }
  }
  
  return `<div class="tool-call-card">
    <div class="tool-call-hdr" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
      <span class="tool-call-icon">${icon}</span>
      <span class="tool-call-name">${esc(name)}</span>
      <span style="font-size:10px;color:var(--tx3);flex:1">${esc(argsDisplay.slice(0, 80))}${argsDisplay.length > 80 ? '…' : ''}</span>
      <span class="tool-call-status ${statusClass}">${statusText}</span>
    </div>
    <div class="tool-call-body" style="display:${result ? 'block' : 'none'}">${resultHtml || 'Loading…'}</div>
  </div>`;
}

// ── API KEY ────────────────────────────────────────────────────────────────
function openKeyModal() {
  // Sync toggle UI to current provider
  switchProvider(S.provider || 'openrouter', /*silent=*/true);
  document.getElementById('key-modal').classList.add('open');
}
function closeKeyModal() {
  document.getElementById('key-modal').classList.remove('open');
  document.getElementById('key-err').style.display = 'none';
}

function switchProvider(prov, silent) {
  // Save current model for current provider before switching
  if (S.provider && S.model && !silent) {
    S._lastModelByProvider = S._lastModelByProvider || {};
    S._lastModelByProvider[S.provider] = S.model;
  }
  S.provider = prov;
  const orBtn  = document.getElementById('prov-btn-openrouter');
  const dsBtn  = document.getElementById('prov-btn-deepseek');
  const gmBtn  = document.getElementById('prov-btn-gemini');
  const oaBtn  = document.getElementById('prov-btn-openai');
  const lcBtn  = document.getElementById('prov-btn-local');
  const orDesc = document.getElementById('prov-desc-openrouter');
  const dsDesc = document.getElementById('prov-desc-deepseek');
  const gmDesc = document.getElementById('prov-desc-gemini');
  const oaDesc = document.getElementById('prov-desc-openai');
  const lcDesc = document.getElementById('prov-desc-local');
  const inp    = document.getElementById('api-key-input');
  const keyLbl = document.getElementById('api-key-label');
  const lcUrlWrap = document.getElementById('local-url-wrap');
  // Reset all buttons
  [orBtn, dsBtn, gmBtn, oaBtn, lcBtn].forEach(b => { if(b){ b.style.background='transparent'; b.style.color='var(--tx2)'; } });
  [orDesc, dsDesc, gmDesc, oaDesc, lcDesc].forEach(d => { if(d) d.style.display='none'; });
  if (lcUrlWrap) lcUrlWrap.style.display = 'none';
  if (keyLbl) keyLbl.textContent = 'API Key';
  if (prov === 'deepseek') {
    dsBtn.style.background = 'var(--acc)'; dsBtn.style.color = '#fff';
    dsDesc.style.display = '';
    inp.placeholder = 'sk-…';
    inp.value = S.deepseekKey || '';
  } else if (prov === 'gemini') {
    gmBtn.style.background = 'var(--acc)'; gmBtn.style.color = '#fff';
    gmDesc.style.display = '';
    inp.placeholder = 'AIza…';
    inp.value = S.geminiKey || '';
  } else if (prov === 'openai') {
    oaBtn.style.background = 'var(--acc)'; oaBtn.style.color = '#fff';
    oaDesc.style.display = '';
    inp.placeholder = 'sk-…';
    inp.value = S.openaiKey || '';
  } else if (prov === 'local') {
    lcBtn.style.background = 'var(--acc)'; lcBtn.style.color = '#fff';
    lcDesc.style.display = '';
    if (lcUrlWrap) { lcUrlWrap.style.display = ''; document.getElementById('local-url-input').value = S.localBaseUrl || 'http://localhost:11434'; }
    if (keyLbl) keyLbl.textContent = 'API Key (optional)';
    inp.placeholder = 'none required for Ollama / leave blank';
    inp.value = S.localKey || '';
  } else {
    orBtn.style.background = 'var(--acc)'; orBtn.style.color = '#fff';
    orDesc.style.display = '';
    inp.placeholder = 'sk-or-v1-…';
    inp.value = S.key || '';
  }
  if (!silent) {
    // If switching with a key already loaded, immediately populate models
    if (prov === 'deepseek' && S.deepseekKey) {
      loadDeepSeekModels();
    } else if (prov === 'gemini' && S.geminiKey) {
      loadGeminiModels();
    } else if (prov === 'openai' && S.openaiKey) {
      loadOpenAIModels();
    } else if (prov === 'local' && S.localBaseUrl) {
      loadLocalModels();
    } else if (prov === 'openrouter' && S.key) {
      S.allModels = S._orModels || [];
      S.filtModels = [...S.allModels];
      renderModelList();
    }
    // Restore last used model for this provider
    const lastModel = S._lastModelByProvider && S._lastModelByProvider[prov];
    if (lastModel && S.allModels.length) {
      const found = S.allModels.find(x => x.id === lastModel.id);
      if (found) {
        selectModel(found.id);
      } else if (lastModel.id) {
        // Model from this provider not yet loaded — will be applied after models load
        S._pendingModel = lastModel;
      }
    } else if (!lastModel) {
      // No saved model for this provider — clear model display
      S.model = null;
      document.getElementById('m-icon').textContent = '🤖';
      document.getElementById('m-name').textContent = 'Select a model';
      document.getElementById('m-price').textContent = '';
    }
    updateCostDisplay();
    persist();
  }
}

async function saveKey() {
  const val = document.getElementById('api-key-input').value.trim();
  // Local provider: val (key) is optional; URL is required
  if (S.provider !== 'local' && !val) return;
  const errEl = document.getElementById('key-err');
  errEl.style.display = 'none';
  const btn = document.getElementById('key-connect-btn');
  btn.textContent = 'Loading models…'; btn.disabled = true;
  try {
    if (S.provider === 'deepseek') {
      await saveDeepSeekKey(val, errEl);
    } else if (S.provider === 'gemini') {
      await saveGeminiKey(val, errEl);
    } else if (S.provider === 'openai') {
      await saveOpenAIKey(val, errEl);
    } else if (S.provider === 'local') {
      await saveLocalKey(val, errEl);
    } else {
      await saveOpenRouterKey(val, errEl);
    }
  } finally {
    btn.textContent = 'Connect'; btn.disabled = false;
  }
}

async function saveOpenRouterKey(val, errEl) {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${val}` }
    });
    if (!res.ok) throw new Error('Invalid key');
    const data = await res.json();
    S.key = val;

    let endpointIds = new Set();
    try {
      const epRes = await fetch('https://openrouter.ai/api/v1/models/endpoints', {
        headers: { 'Authorization': `Bearer ${val}` }
      });
      if (epRes.ok) {
        const epData = await epRes.json();
        (epData.data || []).forEach(ep => {
          if (ep.model_id) endpointIds.add(ep.model_id.replace(/:(free|nitro|floor|beta)$/, ''));
          if (ep.id) endpointIds.add(ep.id.replace(/:(free|nitro|floor|beta)$/, ''));
        });
      }
    } catch(e) { /* endpoints API may not exist */ }

    S.allModels = (data.data || [])
      .filter(m => {
        if (m.id.startsWith('openrouter/')) return false;
        if (!m.context_length || m.context_length <= 0) return false;
        const baseId = m.id.replace(/:(free|nitro|floor|beta)$/, '');
        if (endpointIds.size > 0 && !endpointIds.has(baseId) && !endpointIds.has(m.id)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    if (S.allModels.length === 0) {
      S.allModels = (data.data || [])
        .filter(m => !m.id.startsWith('openrouter/') && m.context_length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    S._orModels = [...S.allModels];
    S.filtModels = [...S.allModels];
    document.getElementById('key-dot').classList.remove('off');
    document.getElementById('key-text').textContent = val.slice(0, 20) + '…';
    closeKeyModal();
    renderModelList();
    updateImageModelDropdown();
    // Auto-open model dropdown so user can pick a model immediately
    if (!S.model) setTimeout(() => toggleMdd(), 150);
    // [ADDED] Save key securely via KeyStore (session by default; user can upgrade to persistent via settings)
    KeyStore.saveKey('openrouter', val, false).then(src => updateSecurityStatus(src));
    persist();
    toast('Connected — ' + S.allModels.length + ' models loaded', 'ok');
  } catch (e) {
    errEl.textContent = 'Invalid API key or network error. Try again.';
    errEl.style.display = 'block';
  }
}


async function saveOpenAIKey(val, errEl) {
  try {
    // Fetch live model list from OpenAI API
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': 'Bearer ' + val }
    });
    if (!res.ok) {
      const ed = await res.json().catch(() => ({}));
      throw new Error(ed?.error?.message || 'Invalid API key (HTTP ' + res.status + ')');
    }
    const data = await res.json();

    // Filter to chat-capable models only, sorted newest first
    const CHAT_PREFIXES = ['gpt-4o', 'gpt-4', 'gpt-3.5', 'o1', 'o3', 'o4'];
    const EXCLUDE = new Set(['gpt-4o-realtime-preview', 'gpt-4o-audio-preview', 'gpt-4o-mini-realtime-preview', 'gpt-4o-mini-audio-preview']);
    const PRICING = {
      'gpt-4o':                { prompt: String(2.5/1e6),   completion: String(10/1e6)   },
      'gpt-4o-mini':           { prompt: String(0.15/1e6),  completion: String(0.6/1e6)  },
      'gpt-4.1':               { prompt: String(2/1e6),     completion: String(8/1e6)    },
      'gpt-4.1-mini':          { prompt: String(0.4/1e6),   completion: String(1.6/1e6)  },
      'gpt-4.1-nano':          { prompt: String(0.1/1e6),   completion: String(0.4/1e6)  },
      'gpt-4-turbo':           { prompt: String(10/1e6),    completion: String(30/1e6)   },
      'gpt-3.5-turbo':         { prompt: String(0.5/1e6),   completion: String(1.5/1e6)  },
      'o1':                    { prompt: String(15/1e6),    completion: String(60/1e6)   },
      'o1-mini':               { prompt: String(1.1/1e6),   completion: String(4.4/1e6)  },
      'o3':                    { prompt: String(10/1e6),    completion: String(40/1e6)   },
      'o3-mini':               { prompt: String(1.1/1e6),   completion: String(4.4/1e6)  },
      'o4-mini':               { prompt: String(1.1/1e6),   completion: String(4.4/1e6)  },
    };

    const chatModels = (data.data || [])
      .filter(m => {
        if (EXCLUDE.has(m.id)) return false;
        return CHAT_PREFIXES.some(p => m.id.startsWith(p));
      })
      .map(m => {
        // Find best matching pricing key (longest prefix match)
        const pKey = Object.keys(PRICING).filter(k => m.id.startsWith(k)).sort((a,b) => b.length - a.length)[0];
        const pricing = PRICING[pKey] || { prompt: String(2/1e6), completion: String(8/1e6) };
        // Human-readable name: capitalise and clean up
        const name = m.id
          .replace(/^gpt-/, 'GPT-').replace(/^o(\d)/, 'o$1')
          .replace(/-(\d{4}-\d{2}-\d{2})$/, '') // strip date suffix
          .replace(/-preview$/, ' Preview');
        return {
          id: m.id, apiId: m.id,
          name,
          context_length: 128000,
          pricing,
          description: 'OpenAI ' + name,
          architecture: { modality: 'text+image->text' },
        };
      })
      // Sort: prefer shorter (canonical) ids first, then alphabetical
      .sort((a, b) => a.id.length - b.id.length || a.name.localeCompare(b.name));

    // De-dup: if a dated version exists alongside undated, keep undated
    const seen = new Set();
    const deduped = chatModels.filter(m => {
      const base = m.id.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/-preview$/, '');
      if (seen.has(base)) return false;
      seen.add(base); return true;
    });

    S.openaiKey = val;
    S.openaiModels = deduped;
    S.allModels  = deduped;
    S.filtModels = deduped;
    document.getElementById('key-dot').classList.remove('off');
    document.getElementById('key-text').textContent = 'OpenAI: ' + val.slice(0, 12) + '…';
    closeKeyModal();
    renderModelList();
    // [ADDED] Save key securely
    KeyStore.saveKey('openai', val, false).then(src => updateSecurityStatus(src));
    persist();
    toast('OpenAI connected — ' + deduped.length + ' models loaded', 'ok');
  } catch(e) {
    errEl.textContent = e.message || 'Invalid API key or network error.';
    errEl.style.display = 'block';
  }
}

// Human-readable names for known DeepSeek model IDs
const DEEPSEEK_NAME_MAP = {
  'deepseek-v4-pro':   'DeepSeek V4 Pro',
  'deepseek-v4-flash': 'DeepSeek V4 Flash',
  'deepseek-v3':       'DeepSeek V3',
  'deepseek-chat':     'DeepSeek V4 Flash (legacy alias)',
  'deepseek-reasoner': 'DeepSeek V4 Flash — Thinking (legacy alias)',
};

async function saveDeepSeekKey(val, errEl) {
  try {
    const res = await fetch('https://api.deepseek.com/models', {
      headers: { 'Authorization': `Bearer ${val}` }
    });
    if (!res.ok) throw new Error('Invalid key');
    const data = await res.json();
    S.deepseekKey = val;
    // Parse live model list, filtering out deprecated aliases and base models
    const HIDE = new Set(['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder']);
    const liveModels = (data.data || [])
      .filter(m => !HIDE.has(m.id))
      .map(m => ({
        id: m.id,
        apiId: m.id,
        name: DEEPSEEK_NAME_MAP[m.id] || m.id,
        context_length: 1048576,
        pricing: DEEPSEEK_MODELS_FALLBACK.find(f => f.id === m.id)?.pricing
                 || { prompt: String(0.14 / 1e6), completion: String(0.28 / 1e6) },
        description: DEEPSEEK_MODELS_FALLBACK.find(f => f.id === m.id)?.description || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    S._deepseekModels = liveModels.length ? liveModels : DEEPSEEK_MODELS_FALLBACK.map(m => ({ ...m, apiId: m.id }));
    loadDeepSeekModels();
    document.getElementById('key-dot').classList.remove('off');
    document.getElementById('key-text').textContent = 'DeepSeek: ' + val.slice(0, 12) + '…';
    closeKeyModal();
    // [ADDED] Save key securely
    KeyStore.saveKey('deepseek', val, false).then(src => updateSecurityStatus(src));
    persist();
    toast('DeepSeek connected — ' + S.allModels.length + ' models loaded', 'ok');
  } catch(e) {
    errEl.textContent = 'Invalid DeepSeek API key or network error. Try again.';
    errEl.style.display = 'block';
  }
}

// ── LOCAL AI PROVIDER ──────────────────────────────────────────────────────
// Connects to any OpenAI-compatible local server (Ollama, LM Studio, llama.cpp, etc.)

async function saveLocalKey(optionalKey, errEl) {
  const urlInput = document.getElementById('local-url-input');
  const baseUrl = (urlInput?.value || '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    errEl.textContent = 'Enter a server URL (e.g. http://localhost:11434)';
    errEl.style.display = 'block';
    return;
  }
  try {
    S.localBaseUrl = baseUrl;
    S.localKey = optionalKey || '';
    await loadLocalModels(true);
    document.getElementById('key-dot').classList.remove('off');
    document.getElementById('key-text').textContent = 'Local: ' + baseUrl.replace(/^https?:\/\//, '');
    closeKeyModal();
    KeyStore.saveKey('local', JSON.stringify({ baseUrl: S.localBaseUrl, key: S.localKey }), false).then(src => updateSecurityStatus(src));
    persist();
    toast('Local AI connected — ' + S.allModels.length + ' model(s) found', 'ok');
  } catch(e) {
    errEl.textContent = 'Could not connect: ' + e.message + '. Make sure your local server is running and CORS is enabled.';
    errEl.style.display = 'block';
  }
}

async function loadLocalModels(throwOnFail = false) {
  const base = (S.localBaseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (S.localKey) headers['Authorization'] = 'Bearer ' + S.localKey;

  let models = [];

  // Try OpenAI-compatible /v1/models endpoint (LM Studio, Ollama 0.2+, llama.cpp)
  try {
    const res = await fetch(base + '/v1/models', { headers });
    if (res.ok) {
      const data = await res.json();
      const raw = data.data || data.models || [];
      models = raw.map(m => {
        const id = m.id || m.name || String(m);
        return {
          id, apiId: id,
          name: id.replace(/:latest$/, ''),
          context_length: m.context_length || 32768,
          pricing: { prompt: '0', completion: '0' },
          description: 'Local — ' + base,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch(e) { /* try next endpoint */ }

  // Fallback: Ollama native /api/tags
  if (!models.length) {
    try {
      const res = await fetch(base + '/api/tags', { headers });
      if (res.ok) {
        const data = await res.json();
        models = (data.models || []).map(m => {
          const id = m.name || m.model || String(m);
          return {
            id, apiId: id,
            name: id.replace(/:latest$/, ''),
            context_length: 32768,
            pricing: { prompt: '0', completion: '0' },
            description: 'Ollama — ' + (m.details?.parameter_size || '') + ' ' + (m.details?.family || ''),
          };
        }).sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch(e) { /* silent */ }
  }

  if (!models.length && throwOnFail) {
    throw new Error('No models found at ' + base + '. Is your local server running?');
  }

  S.localModels = models;
  S.allModels = models;
  S.filtModels = [...models];
  renderModelList();
  if (typeof updateImageModelDropdown === 'function') updateImageModelDropdown();

  // Auto-select first model if nothing active
  if (!S.model && models.length) {
    const last = S._lastModelByProvider && S._lastModelByProvider['local'];
    const pick = (last && models.find(m => m.id === last.id)) || models[0];
    if (pick) selectModel(pick.id);
  }
}

function loadDeepSeekModels() {
  const models = S._deepseekModels || DEEPSEEK_MODELS_FALLBACK.map(m => ({ ...m, apiId: m.id }));
  S.allModels = models;
  S.filtModels = [...S.allModels];
  renderModelList();
  // Auto-select V4 Flash by default, or first available
  const currentIsDeepSeek = S.model && models.find(m => m.id === S.model?.id);
  if (!currentIsDeepSeek) {
    const preferred = models.find(m => m.id === 'deepseek-v4-flash') || models[0];
    if (preferred) selectModel(preferred.id);
  }
}

// ── GEMINI API ─────────────────────────────────────────────────────────────
async function saveGeminiKey(val, errEl) {
  try {
    // Validate by listing models
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(val)}&pageSize=50`);
    if (!res.ok) throw new Error('Invalid key');
    const data = await res.json();
    S.geminiKey = val;
    // Parse live model list — keep only generateContent-capable chat models
    const liveModels = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent')
               && !m.name.includes('embedding') && !m.name.includes('aqa'))
      .map(m => {
        const id = m.name.replace('models/', '');
        const fallback = GEMINI_MODELS_FALLBACK.find(f => f.id === id);
        return {
          id,
          apiId: id,
          name: m.displayName || id,
          context_length: m.inputTokenLimit || 1048576,
          pricing: fallback?.pricing || { prompt: String(0.075 / 1e6), completion: String(0.30 / 1e6) },
          description: m.description || fallback?.description || '',
          architecture: { modality: m.name.includes('vision') || m.name.includes('flash') || m.name.includes('pro') ? 'text+image->text' : 'text->text' },
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    S._geminiModels = liveModels.length ? liveModels : GEMINI_MODELS_FALLBACK.map(m => ({ ...m, apiId: m.id }));
    loadGeminiModels();
    document.getElementById('key-dot').classList.remove('off');
    document.getElementById('key-text').textContent = 'Gemini: ' + val.slice(0, 12) + '…';
    closeKeyModal();
    // [ADDED] Save key securely
    KeyStore.saveKey('gemini', val, false).then(src => updateSecurityStatus(src));
    persist();
    toast('Gemini connected — ' + S.allModels.length + ' models loaded', 'ok');

    // Auto-detect free vs paid tier asynchronously
    _detectGeminiTier(val);
  } catch(e) {
    errEl.textContent = 'Invalid Gemini API key or network error. Try again.';
    errEl.style.display = 'block';
  }
}

async function _detectGeminiTier(key) {
  // Try a minimal request to a paid-only model; free-tier keys get RESOURCE_EXHAUSTED or 403
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 1 } })
    });
    const d = await r.json();
    // If we get a response or a non-quota error, user is on paid tier
    const isQuotaError = r.status === 429 || (d.error?.status === 'RESOURCE_EXHAUSTED') || (d.error?.message || '').toLowerCase().includes('quota') || r.status === 403;
    S.cfg.geminiTrackCost = !isQuotaError; // track cost if paid
    S._geminiIsPaid = !isQuotaError;
    persist();
    // Update settings UI if open
    const gcToggle = document.getElementById('toggle-gemini-cost');
    if (gcToggle) gcToggle.checked = !!S.cfg.geminiTrackCost;
    updateCostDisplay();
  } catch(e) {
    // Network error — assume free tier
    S._geminiIsPaid = false;
    S.cfg.geminiTrackCost = false;
  }
}


const OPENAI_MODELS = [
  { id: 'gpt-4o',             name: 'GPT-4o',             context_length: 128000, pricing: { prompt: String(2.5/1e6),   completion: String(10/1e6)  }, description: 'Most capable multimodal model', architecture: { modality: 'text+image->text' } },
  { id: 'gpt-4o-mini',        name: 'GPT-4o Mini',        context_length: 128000, pricing: { prompt: String(0.15/1e6),  completion: String(0.6/1e6) }, description: 'Fast and affordable multimodal', architecture: { modality: 'text+image->text' } },
  { id: 'gpt-4.1',            name: 'GPT-4.1',            context_length: 1047576, pricing: { prompt: String(2/1e6),    completion: String(8/1e6)   }, description: 'Latest GPT-4.1 flagship', architecture: { modality: 'text+image->text' } },
  { id: 'gpt-4.1-mini',       name: 'GPT-4.1 Mini',       context_length: 1047576, pricing: { prompt: String(0.4/1e6),  completion: String(1.6/1e6) }, description: 'Small fast GPT-4.1', architecture: { modality: 'text+image->text' } },
  { id: 'gpt-4.1-nano',       name: 'GPT-4.1 Nano',       context_length: 1047576, pricing: { prompt: String(0.1/1e6),  completion: String(0.4/1e6) }, description: 'Smallest GPT-4.1', architecture: { modality: 'text+image->text' } },
  { id: 'o3',                 name: 'o3',                 context_length: 200000,  pricing: { prompt: String(10/1e6),   completion: String(40/1e6)  }, description: 'Powerful reasoning model' },
  { id: 'o4-mini',            name: 'o4-mini',            context_length: 200000,  pricing: { prompt: String(1.1/1e6),  completion: String(4.4/1e6) }, description: 'Fast efficient reasoning' },
  { id: 'o3-mini',            name: 'o3-mini',            context_length: 200000,  pricing: { prompt: String(1.1/1e6),  completion: String(4.4/1e6) }, description: 'Compact reasoning model' },
];

function loadOpenAIModels() {
  // Use cached models if available (set by saveOpenAIKey), else fallback static list
  if (!S.openaiModels || !S.openaiModels.length) {
    S.openaiModels = OPENAI_MODELS.map(m => ({ ...m, apiId: m.id }));
  }
  S.allModels   = S.openaiModels;
  S.filtModels  = S.openaiModels;
  renderModelList();
  if (S._pendingModel) {
    const m = S.openaiModels.find(x => x.id === S._pendingModel.id) || S._pendingModel;
    selectModel(m);
    S._pendingModel = null;
  }
}

function loadGeminiModels() {
  const models = S._geminiModels || GEMINI_MODELS_FALLBACK.map(m => ({ ...m, apiId: m.id }));
  S.allModels = models;
  S.filtModels = [...S.allModels];
  renderModelList();
  const currentIsGemini = S.model && models.find(m => m.id === S.model?.id);
  if (!currentIsGemini) {
    const preferred = models.find(m => m.id === 'gemini-2.5-flash-preview-04-17') || models.find(m => m.id.includes('3.1') && m.id.includes('flash')) || models.find(m => m.id === 'gemini-2.0-flash') || models.find(m => m.id.includes('flash')) || models[0];
    if (preferred) selectModel(preferred.id);
  }
}

function updateImageModelDropdown() {
  const sel = document.getElementById('sl-img-model');
  if (!sel) return;
  sel.innerHTML = '<option value="">Auto (from chat model)</option>';
  S.allModels.forEach(m => {
    if (IMAGE_GEN_MODELS.some(imgM => m.id === imgM || m.id.startsWith(imgM.split('/')[0] + '/'))) {
      sel.innerHTML += `<option value="${esc(m.id)}">${esc(m.name)}</option>`;
    }
  });
}

// ── MODEL SELECTOR ─────────────────────────────────────────────────────────
function toggleMdd() {
  const dd = document.getElementById('mdd');
  const ch = document.getElementById('m-chev');
  const isOpen = dd.classList.toggle('open');
  ch.classList.toggle('open', isOpen);
  if (isOpen) setTimeout(() => document.getElementById('model-search').focus(), 50);
}
function closeMdd() {
  document.getElementById('mdd').classList.remove('open');
  document.getElementById('m-chev').classList.remove('open');
}

function modelIcon(id) {
  if (id.includes('openai') || id.includes('gpt') || /\/o[134]-/.test(id)) return '⬛';
  if (id.includes('anthropic') || id.includes('claude')) return '🟠';
  if (id.includes('google') || id.includes('gemini')) return '🔵';
  if (id.includes('meta') || id.includes('llama')) return '🦙';
  if (id.includes('mistral') || id.includes('mixtral')) return '🌊';
  if (id.includes('qwen')) return '🌸';
  if (id.includes('deepseek')) return '🔮';
  if (id.includes('cohere')) return '⚡';
  if (id.includes('dall-e') || id.includes('stable-diffusion') || id.includes('flux') || id.includes('ideogram')) return '🖼️';
  return '✦';
}
function fmtPrice(p) {
  if (p == null) return null;
  const n = parseFloat(p);
  if (n === 0) return 'Free';
  return `$${(n * 1e6).toFixed(2)}/M`;
}
function fmtCtx(c) {
  if (!c) return '';
  if (c >= 1e6) return `${(c / 1e6).toFixed(1)}M`;
  if (c >= 1000) return `${Math.round(c / 1000)}K`;
  return `${c}`;
}
function isVision(m) { return (m.architecture?.modality || '').includes('image') || (m.description || '').toLowerCase().includes('vision') || m.id.includes('vision'); }
function isFree(m) { return parseFloat(m.pricing?.prompt || '0') === 0 && parseFloat(m.pricing?.completion || '0') === 0; }
function isImageGen(m) { return IMAGE_GEN_MODELS.some(imgM => m.id === imgM || m.id.startsWith(imgM.split('/')[0] + '/')); }
function hasToolUse(m) {
  // Models known to support tool/function calling
  const toolModels = ['gpt-4', 'gpt-3.5-turbo', 'claude-3', 'claude-3.5', 'gemini-1.5', 'gemini-2', 'mistral-large', 'command-r', 'llama-3.1', 'llama-3.2', 'qwen-2.5', 'deepseek'];
  return toolModels.some(tm => m.id.includes(tm));
}

function setFilter(f, el) {
  S.activeFilter = f;
  document.querySelectorAll('.fchip-f').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  filterModels(document.getElementById('model-search').value);
}

function filterModels(q) {
  const lq = q.toLowerCase().trim();
  const f = S.activeFilter;
  S.filtModels = S.allModels.filter(m => {
    const mName = m.name || m.id || '';
    if (lq && !mName.toLowerCase().includes(lq) && !m.id.toLowerCase().includes(lq)) return false;
    if (f === 'all') return true;
    if (f === 'free') return isFree(m);
    if (f === 'vision') return isVision(m);
    if (f === 'image') return isImageGen(m);
    if (f === 'tool_use') return hasToolUse(m);
    return m.id.toLowerCase().startsWith(f + '/');
  });
  renderModelList();
}

function toggleFav(id, e) {
  e.stopPropagation();
  const idx = S.favModels.indexOf(id);
  if (idx >= 0) S.favModels.splice(idx, 1);
  else S.favModels.push(id);
  persist();
  renderModelList();
}

function renderModelItem(m, isFavSection) {
  const ip = fmtPrice(m.pricing?.prompt);
  const ctx = fmtCtx(m.context_length);
  const vis = isVision(m), free = isFree(m), imgGen = isImageGen(m), tools = hasToolUse(m);
  const sel = S.model?.id === m.id ? 'sel' : '';
  const ps = ip || (free ? 'Free' : '—');
  const faved = S.favModels.includes(m.id);
  return `<div class="m-item ${sel}" onclick="selectModel(${JSON.stringify(m.id).replace(/"/g, '&quot;')})">
    <button class="m-fav-btn${faved ? ' active' : ''}" onclick="toggleFav(${JSON.stringify(m.id).replace(/"/g, '&quot;')},event)" title="${faved ? 'Remove favourite' : 'Add to favourites'}">${faved ? '★' : '☆'}</button>
    <span style="font-size:18px;line-height:1;flex-shrink:0">${modelIcon(m.id)}</span>
    <div class="m-info">
      <div class="m-item-name">${esc(m.name)}</div>
      <div class="m-item-id">${esc(m.id)}</div>
    </div>
    <div class="m-meta">
      <div class="m-cost">${ps}</div>
      <div class="m-ctx">${ctx ? ctx + ' ctx' : ''}</div>
      <div style="display:flex;gap:3px;margin-top:2px">
        ${vis ? '<span class="mbadge bvis">Vision</span>' : ''}
        ${free ? '<span class="mbadge bfree">Free</span>' : ''}
        ${imgGen ? '<span class="mbadge" style="background:rgba(255,106,176,.2);color:#ff6ab0">🖼️</span>' : ''}
        ${tools ? '<span class="mbadge" style="background:rgba(245,166,35,.2);color:#f5a623">🔧</span>' : ''}
      </div>
    </div>
  </div>`;
}

function renderModelList() {
  const el = document.getElementById('modellist');
  if (!S.allModels.length) { el.innerHTML = '<div class="m-loading">Enter API key to load models</div>'; return; }
  if (!S.filtModels.length) { el.innerHTML = '<div class="m-loading">No models found</div>'; return; }

  const favSet = new Set(S.favModels);
  const favItems = S.filtModels.filter(m => favSet.has(m.id));
  const restItems = S.filtModels.filter(m => !favSet.has(m.id));

  let html = '';
  if (favItems.length > 0) {
    html += `<div class="m-fav-divider">★ Favourites</div>`;
    html += favItems.map(m => renderModelItem(m, true)).join('');
    if (restItems.length > 0) html += `<div class="m-fav-divider">All Models</div>`;
  }
  html += restItems.map(m => renderModelItem(m, false)).join('');
  el.innerHTML = html;
}

function selectModel(id) {
  const m = S.allModels.find(x => x.id === id);
  if (!m) return;
  m.apiId = m.id.replace(/:(free|nitro|floor|beta)$/, '');
  S.model = m;
  // Remember last used model for this provider
  S._lastModelByProvider = S._lastModelByProvider || {};
  S._lastModelByProvider[S.provider || 'openrouter'] = m;
  document.getElementById('m-icon').textContent = modelIcon(m.id);
  document.getElementById('m-name').textContent = m.name;
  const ip = parseFloat(m.pricing?.prompt || 0);
  const op = parseFloat(m.pricing?.completion || 0);
  document.getElementById('m-price').textContent = S.provider === 'gemini'
    ? 'Free (Google quota)'
    : S.provider === 'local'
    ? 'Free (local)'
    : (ip === 0 && op === 0) ? 'Free' : `$${(ip*1e6).toFixed(2)}/$${(op*1e6).toFixed(2)}/M`;
  closeMdd();
  renderModelList();
  updateEst();
  persist();
  updateCtxBar();
  toast(`Model: ${m.name}`, 'ok');
}

// ── RIGHT MESSAGE NAV (DeepSeek style) ────────────────────────────────────
S.msgNavOpen = false;

function toggleMsgNav() {
  S.msgNavOpen = !S.msgNavOpen;
  const nav = document.getElementById('msg-nav');
  const app = document.getElementById('app');
  nav.classList.toggle('open', S.msgNavOpen);
  app.classList.toggle('mnav-open', S.msgNavOpen);
  if (S.msgNavOpen) renderMsgNav();
}

function renderMsgNav() {
  const el = document.getElementById('mnav-list');
  if (!el) return;
  if (!S.msgs.length) {
    el.innerHTML = '<div class="mnav-empty">Send a message<br>to see it here</div>';
    return;
  }
  el.innerHTML = S.msgs.map((m, i) => {
    const isUser = m.role === 'user';
    // Strip code blocks and newlines for snippet
    const snippet = (m.content || '')
      .replace(/```[\s\S]*?```/g, '[code]')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 55) + ((m.content || '').replace(/```[\s\S]*?```/g,'').trim().length > 55 ? '…' : '');
    const display = snippet || (m.imageResult ? '🖼️ Image generated' : (isUser ? '(attachment)' : '…'));
    return `<div class="mnav-item ${isUser ? 'mnav-user' : 'mnav-ai'}" onclick="jumpToMsg(${i})" data-idx="${i}">
      <div class="mnav-role">${isUser ? 'You' : 'Atlas'}</div>
      <div class="mnav-text">${esc(display)}</div>
    </div>`;
  }).join('<div class="mnav-divider"></div>');
}

function jumpToMsg(idx) {
  const rows = document.querySelectorAll('#chat-area .msg-row');
  if (rows[idx]) {
    rows[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
    rows[idx].style.transition = 'background .15s';
    rows[idx].style.background = 'var(--hov)';
    setTimeout(() => { rows[idx].style.background = ''; }, 900);
    document.querySelectorAll('.mnav-item').forEach((el, i) => el.classList.toggle('active', i === idx));
  }
}

// ── SIDEBAR ────────────────────────────────────────────────────────────────
function toggleSb() {
  const mob = window.innerWidth <= 600;
  if (mob) {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sov');
    const isOpen = sb.classList.toggle('open');
    ov.classList.toggle('on', isOpen);
  } else {
    S.sbOpen = !S.sbOpen;
    document.getElementById('sidebar').classList.toggle('coll', !S.sbOpen);
    persist();
  }
}
function closeSb() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sov').classList.remove('on');
}

function newChat() {
  const id = Date.now() + '';
  const newConv = { id, title: 'New conversation', msgs: [], codeStore: [] };
  S.convs.unshift(newConv);
  S.chatId = id; S.msgs = [];
  S.codeStore.clear();
  // Close nav on new chat (no messages yet)
  S.msgNavOpen = false;
  document.getElementById('msg-nav').classList.remove('open');
  document.getElementById('app').classList.remove('mnav-open');
  renderChatList(); renderMessages();
  // [CHANGED] Save new conv to IndexedDB (not localStorage)
  ChatStorage.saveConversation(newConv).catch(e => console.warn('Atlas: newChat save failed', e));
  persist();
}

function loadChat(id) {
  const c = S.convs.find(x => x.id === id);
  if (!c) return;
  S.chatId = id; S.msgs = c.msgs;
  // Restore this conv's codeStore (patched versions) before rendering
  S.codeStore.clear();
  if (Array.isArray(c.codeStore) && c.codeStore.length) {
    S.codeStore = new Map(c.codeStore);
  }
  renderChatList(); renderMessages(); scrollBottom();
  // Auto-open nav if chat has messages (DeepSeek style)
  if (c.msgs.length > 0 && window.innerWidth > 600 && !S.msgNavOpen) {
    S.msgNavOpen = true;
    document.getElementById('msg-nav').classList.add('open');
    document.getElementById('app').classList.add('mnav-open');
  }
  closeSb();
  persist();
}

function deleteChat(id, e) {
  e.stopPropagation();
  S.convs = S.convs.filter(c => c.id !== id);
  if (S.chatId === id) { S.chatId = null; S.msgs = []; renderMessages(); }
  renderChatList();
  // [CHANGED] Delete from IndexedDB too
  ChatStorage.deleteConversation(id).catch(e => console.warn('Atlas: deleteChat IndexedDB failed', e));
  persist();
}

function filterConvs(q) {
  const lq = q.trim().toLowerCase();
  const el = document.getElementById('chatlist');
  if (!lq) { renderChatList(); return; }
  const filtered = S.convs.filter(c => c.title.toLowerCase().includes(lq));
  if (!filtered.length) {
    el.innerHTML = '<div style="padding:14px;color:var(--tx3);font-size:12px;text-align:center">No matches</div>';
    return;
  }
  el.innerHTML = filtered.map(c => `
    <div class="ci ${c.id === S.chatId ? 'act' : ''}" onclick="loadChat('${c.id}')">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style="color:var(--tx3);flex-shrink:0"><path d="M11 1H2a1 1 0 00-1 1v6a1 1 0 001 1h1.5L5 11l1.5-2H11a1 1 0 001-1V2a1 1 0 00-1-1z" stroke="currentColor" stroke-width="1.1"/></svg>
      <div class="ctitle">${esc(c.title)}</div>
      <button class="cdel" onclick="deleteChat('${c.id}',event)">✕</button>
    </div>`).join('');
}

function renderChatList() {
  const el = document.getElementById('chatlist');
  if (!S.convs.length) {
    el.innerHTML = '<div style="padding:14px;color:var(--tx3);font-size:12px;text-align:center">No conversations yet</div>';
    return;
  }
  el.innerHTML = S.convs.map(c => `
    <div class="ci ${c.id === S.chatId ? 'act' : ''}" onclick="loadChat('${c.id}')">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style="color:var(--tx3);flex-shrink:0"><path d="M11 1H2a1 1 0 00-1 1v6a1 1 0 001 1h1.5L5 11l1.5-2H11a1 1 0 001-1V2a1 1 0 00-1-1z" stroke="currentColor" stroke-width="1.1"/></svg>
      <div class="ctitle">${esc(c.title)}</div>
      <button class="cdel" onclick="deleteChat('${c.id}',event)">✕</button>
    </div>`).join('');
}

// ── RENDER MESSAGES ────────────────────────────────────────────────────────
function renderMessages() {
  const ca = document.getElementById('chat-area');
  if (!S.msgs.length) {
    ca.innerHTML = `<div id="welcome">
      <div class="w-logo">Atlas</div>
      <p class="w-sub">Unified AI</p>
      <div class="w-chips">
        <div class="w-chip" onclick="setPrompt('Write a Python script to parse CSV and output summary statistics')">📊 Analyze data</div>
        <div class="w-chip" onclick="setPrompt('Generate a complete React login component with form validation')">⚛️ Generate code</div>
        <div class="w-chip" onclick="setPrompt('Write a detailed technical document about REST API design principles')">📄 Write a doc</div>
        <div class="w-chip" onclick="setPrompt('Explain transformer architecture in modern LLMs in depth')">🧠 Deep dive</div>
        <div class="w-chip" onclick="setPrompt('Generate an image of a serene mountain lake at sunset with pine trees')">🖼️ Generate image</div>
        <div class="w-chip" onclick="setPrompt('Search the web for the latest AI news and summarize the top 3 stories')">🔧 Use tools</div>
      </div>
    </div>`;
    return;
  }
  ca.innerHTML = S.msgs.map((m,i) => renderMsg(m,i)).join('');
  scrollBottom();
  if (S.msgNavOpen) renderMsgNav();
}

function renderMsg(m, idx) {
  const isUser = m.role === 'user';
  const av = isUser
    ? `<div class="avatar uav">T</div>`
    : `<div class="avatar aav">✦</div>`;
  let fc = '';
  if (m.files?.length) fc = `<div class="file-chips-msg">${m.files.map(f => `<div class="fchip-msg"><span>${fileIcon(f.type)}</span>${esc(f.name)}</div>`).join('')}</div>`;
  
  // Handle image generation results in messages
  let imageContent = '';
  if (m.imageResult?.images) {
    imageContent = renderImageResult(m.imageResult.images, m.imageResult.prompt, m.imageResult.revised_prompt);
  }
  
  // Handle tool calls in messages
  let toolContent = '';
  if (m.toolCalls?.length) {
    m.toolCalls.forEach(tc => {
      const result = m.toolResults?.[tc.id];
      const status = result ? (result.error ? 'error' : 'done') : 'pending';
      toolContent += renderToolCall(tc, result, status);
    });
  }
  
  const bubbleContent = isUser
    ? `<div class="msg-bubble" id="bubble-${idx}">${fc}${esc(m.content).replace(/\n/g, '<br>')}</div>`
    : `<div class="msg-bubble"><div class="md-body">${toolContent}${imageContent}${renderMarkdown(m.content, idx)}</div></div>`;
  
  let meta = '';
  if (!isUser && (m.iTok || m.cost)) {
    meta = `<div class="msg-meta">
      <span class="meta-tok">${(m.iTok || 0) + (m.oTok || 0)} tokens</span>
      ${m.cost ? `<span class="meta-cost">$${m.cost.toFixed(6)}</span>` : ''}
      ${m.imageCost ? `<span class="meta-cost" style="color:#ff6ab0">🖼️ $${m.imageCost.toFixed(4)}</span>` : ''}
      <span>${S.model?.name || ''}</span>
    </div>`;
  }
  
  let actions = '';
  if (isUser && idx != null) {
    actions = `<div class="msg-actions">
      <button class="ma-btn" onclick="copyMsgText(${idx})" title="Copy">📋 Copy</button>
      <button class="ma-btn" onclick="editMsg(${idx})" title="Edit">✏️ Edit</button>
      <button class="ma-btn" onclick="deleteMsg(${idx})" title="Delete" style="color:var(--red);border-color:rgba(255,95,109,.3)">🗑 Delete</button>
      <button class="ma-btn regen" onclick="deleteAndResend(${idx})" title="Delete & resend">↻ Resend</button>
    </div>`;
  } else if (!isUser && idx != null) {
    actions = `<div class="msg-actions">
      <button class="ma-btn" onclick="copyMsgText(${idx})" title="Copy">📋 Copy</button>
      <button class="ma-btn regen" onclick="regenMsg(${idx})" title="Regenerate">↻ Retry</button>
      <button class="ma-btn" onclick="deleteMsg(${idx})" title="Delete" style="color:var(--red);border-color:rgba(255,95,109,.3)">🗑 Delete</button>
    </div>`;
  }
  return `<div class="msg-row ${isUser ? 'user' : 'ai'}" data-idx="${idx}">${av}<div class="msg-body">${bubbleContent}${meta}${actions}</div></div>`;
}

// ── PATCH EDIT SYSTEM ─────────────────────────────────────────────────────

// Edit intent: requires an edit verb + a code-context signal to avoid false positives
const EDIT_KEYWORDS = /\b(fix|change|update|edit|replace|rename|refactor|remove|delete|insert|modify|rewrite|swap|convert|adjust|correct|improve|extend|reduce|simplify|extract|merge|split|make|set|turn|add|use)\b/i;
const CODE_CONTEXT  = /\b(color|colour|style|function|class|variable|button|line|code|html|css|js|script|bird|pipe|game|background|font|size|layout|component|element|tag|attribute|property|value|text|image|icon|border|padding|margin|width|height|position|animation|canvas|loop|score|speed|gap|render|draw)\b/i;

function isEditIntent(text) {
  if (!S.codeStore.size) return false;
  for (const id of S.codeStore.keys()) { if (text.includes(id)) return true; }
  return EDIT_KEYWORDS.test(text) && CODE_CONTEXT.test(text);
}

// Return the single most-relevant block ID: explicit mention wins, else most recent
function pickRelevantBlock(text) {
  for (const [id] of S.codeStore.entries()) { if (text.includes(id)) return id; }
  let last = null;
  for (const id of S.codeStore.keys()) last = id;
  return last;
}

function buildCodeStoreInjection(userText) {
  if (!S.codeStore.size) return '';
  const bid = pickRelevantBlock(userText || '');
  if (!bid) return '';
  const { lang, content } = S.codeStore.get(bid);
  const lines = content.split('\n');
  const totalLines = lines.length;
  const chars = content.length;

  // ~4000 tokens = ~16000 chars. Above this, send only the most relevant sections.
  const FULL_LIMIT = 16000;
  let fileSection;

  if (chars <= FULL_LIMIT) {
    const numbered = lines.map((ln, i) => (i + 1) + ': ' + ln).join('\n');
    fileSection = `\n\n--- CURRENT CODE BLOCK [${bid}|${lang}] (${totalLines} lines) ---\n${numbered}\n--- END ---\n`;
  } else {
    // Large file: score every line by keyword relevance to the user's edit request,
    // then pick up to 3 non-overlapping windows of ~60 lines each.
    const CTX = 60; // lines of context per window
    const keywords = (userText || '').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w => w.length > 2);
    // Score each line — exact keyword hits score higher, partial hits also rewarded
    const scores = lines.map(ln => {
      const ll = ln.toLowerCase();
      return keywords.reduce((s, kw) => s + (ll.includes(kw) ? (ll === kw ? 5 : 3) : 0), 0);
    });
    // Smooth scores with a small window so context around hits is included
    const smoothed = scores.map((_, i) =>
      scores.slice(Math.max(0, i - 4), i + 5).reduce((a, b) => a + b, 0)
    );
    // Pick up to 3 non-overlapping windows centered on highest-scored lines
    const winHalf = Math.floor(CTX / 2);
    const chosen = [];
    const used = new Uint8Array(totalLines);
    for (let pass = 0; pass < 3; pass++) {
      let best = -1, bestScore = -1;
      for (let i = winHalf; i < totalLines - winHalf; i++) {
        if (!used[i] && smoothed[i] > bestScore) { bestScore = smoothed[i]; best = i; }
      }
      if (best === -1 || bestScore === 0) break;
      const from = Math.max(0, best - winHalf);
      const to   = Math.min(totalLines - 1, best + winHalf);
      chosen.push({ from, to });
      for (let i = from; i <= to; i++) used[i] = 1;
    }
    chosen.sort((a, b) => a.from - b.from);

    if (chosen.length === 0) {
      // Fallback: first CTX lines
      const head = lines.slice(0, CTX).map((ln, i) => (i + 1) + ': ' + ln).join('\n');
      fileSection = `\n\n--- CODE BLOCK [${bid}|${lang}] ${totalLines} lines — showing lines 1–${CTX} (no keyword match found) ---\n${head}\n--- END SNIPPET ---\n`;
    } else {
      const parts = chosen.map(({ from, to }) => {
        const snippet = lines.slice(from, to + 1).map((ln, i) => (from + i + 1) + ': ' + ln).join('\n');
        return `[Lines ${from + 1}–${to + 1}]\n${snippet}`;
      }).join('\n\n');
      fileSection = `\n\n--- CODE BLOCK [${bid}|${lang}] ${totalLines} lines total — showing most relevant sections (full file omitted to save tokens) ---\n${parts}\n--- END SNIPPET (if old_str not found here, ask the user to clarify which part to change) ---\n`;
    }
  }

  // ALWAYS use patch mode — never allow full rewrites.
  const modeNote = `\n\n⚠️ PATCH MODE — CRITICAL RULES:
1. Output ONLY a \`\`\`patch block. Do NOT rewrite the whole file. Do NOT output a new code block.
2. Use block_id="${bid}" exactly as shown.
3. old_str must be verbatim text from the file above (copy-paste exactly, NO line numbers).
4. Keep old_str SHORT — just enough to be unique (1–3 lines max).
5. Format:
\`\`\`patch
{"patches":[{"block_id":"${bid}","old_str":"exact text","new_str":"replacement"}]}
\`\`\`
Multiple patches allowed. Brief explanation after the block is fine.`;

  return fileSection + modeNote;
}


// Apply a parsed patch array to the DOM and codeStore
// Returns { applied: number, failed: string[], blockChanges: Map<id,{changed,added}> }
function applyPatches(patches) {
  let applied = 0;
  const failed = [];
  const blockChanges = new Map(); // blockId -> { changed: Set, added: Set }

  for (const p of patches) {
    const { block_id, old_str, new_str } = p;
    const entry = S.codeStore.get(block_id);
    if (!entry) { failed.push(`${block_id}: block not found in store`); continue; }

    const idx = entry.content.indexOf(old_str);
    if (idx === -1) { failed.push(`${block_id}: old_str not found`); continue; }

    const occurrences = entry.content.split(old_str).length - 1;
    if (occurrences > 1) console.warn(`Atlas patch: old_str found ${occurrences} times in ${block_id}, applying first occurrence`);

    // Compute which line numbers are affected
    const preContent = entry.content.slice(0, idx);
    const startLine = (preContent.match(/\n/g) || []).length + 1;
    const oldLineCount = (old_str.match(/\n/g) || []).length + 1;
    const newLineCount = (new_str.match(/\n/g) || []).length + 1;

    const newContent = entry.content.replace(old_str, new_str);
    entry.content = newContent;
    S.codeStore.set(block_id, entry);

    // ── PERSISTENCE FIX: update the source message's content so the patched
    // code survives page reload. Use srcMsgIdx stored on codeStore entry to
    // find the exact message and do a direct string replacement.
    if (entry.srcMsgIdx !== undefined) {
      const srcMsg = S.msgs[entry.srcMsgIdx];
      if (srcMsg && srcMsg.role === 'assistant' && typeof srcMsg.content === 'string') {
        srcMsg.content = srcMsg.content.replace(old_str, new_str);
      }
    }

    // Build change sets
    if (!blockChanges.has(block_id)) blockChanges.set(block_id, { changed: new Set(), added: new Set() });
    const bc = blockChanges.get(block_id);
    for (let l = startLine; l < startLine + Math.max(oldLineCount, newLineCount); l++) {
      if (l >= startLine + oldLineCount && l < startLine + newLineCount) bc.added.add(l);
      else bc.changed.add(l);
    }

    // Update data-raw on DOM element, re-render with highlights, sync _artifacts
    const blk = document.getElementById(block_id);
    if (blk) {
      const newRawB64 = btoa(unescape(encodeURIComponent(newContent)));
      blk.dataset.raw = newRawB64;
      const pre = blk.querySelector('pre');
      if (pre) {
        pre.innerHTML = buildLineTable(highlightCode(esc(newContent), entry.lang), bc.changed, bc.added);
        const firstChanged = pre.querySelector('.code-ln.changed, .code-ln.changed-add');
        if (firstChanged) setTimeout(() => firstChanged.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80);
      }
      // Keep _artifacts in sync so preview always shows latest patched code
      const artIdx = typeof _artifacts !== 'undefined' ? _artifacts.findIndex(a => a.id === block_id) : -1;
      if (artIdx >= 0) {
        _artifacts[artIdx].code = newContent;
        // If this artifact is currently displayed, hot-reload the iframe
        if (typeof _activeArt !== 'undefined' && _activeArt === artIdx) {
          loadArtFrame(_artifacts[artIdx]);
        }
      }
    }
    applied++;
  }
  return { applied, failed, blockChanges };
}

// Check if the completed assistant response contains a patch block
// Returns parsed patches array or null
function extractPatches(text) {
  // First priority: explicitly tagged ```patch blocks
  const patchMatch = text.match(/```patch\s*\n?([\s\S]*?)\n?```/);
  if (patchMatch) {
    try {
      const parsed = JSON.parse(patchMatch[1].trim());
      if (Array.isArray(parsed.patches)) return parsed.patches;
    } catch(e) { console.warn('Atlas: patch JSON parse failed', e); }
  }
  // Second: raw JSON object containing "patches" anywhere in the text
  const raw = text.match(/\{[\s\S]*?"patches"\s*:\s*\[[\s\S]*?\]\s*\}/);
  if (raw) {
    try {
      const parsed = JSON.parse(raw[0]);
      if (Array.isArray(parsed.patches)) return parsed.patches;
    } catch {}
  }
  return null;
}


// ── CONTINUATION SYSTEM ───────────────────────────────────────────────────

// Returns true if the text looks like it was cut off mid-generation
function isTruncated(text) {
  if (!text || text.length < 40) return false;
  const t = text.trimEnd();
  // Unclosed fenced code block — definitive truncation
  const fenceMatches = (t.match(/```/g) || []).length;
  if (fenceMatches % 2 !== 0) return true;
  return false;
}

// Returns true if text looks like it might be cut off mid-sentence,
// but is NOT a definitive code truncation (used for manual-only Continue button)
function mightBeTruncated(text) {
  if (!text || text.length < 300) return false;
  const t = text.trimEnd();
  // If isTruncated already caught it, skip
  const fenceMatches = (t.match(/```/g) || []).length;
  if (fenceMatches % 2 !== 0) return false;
  // Ends mid-sentence — no terminal punctuation, closing bracket, or closing fence
  const last = t.slice(-120);
  const endsClean = /[.!?`>\]}):\n]$/.test(last) || /```\s*$/.test(last);
  return !endsClean;
}

// Track continuation state per AI message
// Key = aiIdx, value = { autoTries: number, continueBtn: element|null }
const _contState = {};
const MAX_AUTO_CONTINUES = 4;

// Called after every completed AI response — checks truncation and acts
async function handleContinuation(aiIdx, full, sEl, mEl, aiRow) {
  const definite = isTruncated(full);
  const ambiguous = !definite && mightBeTruncated(full);

  if (!definite && !ambiguous) return;

  const state = _contState[aiIdx] || { autoTries: 0 };
  _contState[aiIdx] = state;

  if (definite) {
    // Unclosed code fence — auto-continue up to MAX_AUTO_CONTINUES times
    if (state.autoTries < MAX_AUTO_CONTINUES) {
      state.autoTries++;
      dbgLog('INFO', `Auto-continue #${state.autoTries} for msg ${aiIdx} (unclosed code block)`);
      toast(`↩ Auto-continuing… (${state.autoTries}/${MAX_AUTO_CONTINUES})`, 'ok');
      await _doContinue(aiIdx, full, sEl, mEl, aiRow);
      return;
    }
  }

  // For ambiguous text truncation OR exhausted auto-continues — only show manual button
  _showContinueBtn(aiIdx, full, sEl, mEl, aiRow);
}

function _showContinueBtn(aiIdx, full, sEl, mEl, aiRow) {
  const state = _contState[aiIdx] || { autoTries: 0 };
  // Remove existing button if any
  if (state.continueBtn) state.continueBtn.remove();

  const btn = document.createElement('button');
  btn.className = 'ma-btn continue-btn';
  btn.innerHTML = '↩ Continue';
  btn.title = 'Response was cut off — click to continue';
  btn.style.cssText = 'color:var(--acc);border-color:var(--acc2);margin-top:6px;font-size:12px;padding:4px 12px;';
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = '…';
    await _doContinue(aiIdx, full, sEl, mEl, aiRow);
  };
  state.continueBtn = btn;
  _contState[aiIdx] = state;

  // Append to msg-body actions area or below the bubble
  const msgBody = aiRow?.querySelector('.msg-body');
  if (msgBody) msgBody.appendChild(btn);
}

async function _doContinue(aiIdx, previousFull, sEl, mEl, aiRow) {
  if (S.streaming) { toast('Already streaming — wait for response to finish', 'er'); return; }
  const activeKey = S.provider === 'deepseek' ? S.deepseekKey : S.provider === 'gemini' ? S.geminiKey : S.provider === 'openai' ? S.openaiKey : S.provider === 'local' ? (S.localKey || 'local') : S.key;
  if (!activeKey) { openKeyModal(); return; }

  // Remove continue button while streaming
  const state = _contState[aiIdx];
  if (state?.continueBtn) { state.continueBtn.remove(); state.continueBtn = null; }

  // Build messages up to and including the truncated response
  const msgsForContinue = buildApiMsgs();
  // Add a user "continue" message
  msgsForContinue.push({ role: 'user', content: 'continue' });

  const sp = document.getElementById('sys-input').value.trim();
  const globalSPCont = S.cfg.globalSysPrompt?.trim();
  const contSysParts = [];
  if (globalSPCont) contSysParts.push(globalSPCont);
  if (sp) contSysParts.push(sp);
  if (contSysParts.length) msgsForContinue.unshift({ role: 'system', content: contSysParts.join('\n\n') });

  const isGemini = S.provider === 'gemini';
  const isDeepSeek = S.provider === 'deepseek';
  
  // Use max possible tokens for continuation
  const contMaxTok = Math.min(S.cfg.maxTok * 2, 32000);

  S.streaming = true; S.ac = new AbortController();
  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = false;
  sendBtn.classList.add('stop');
  sendBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="2" y="2" width="7" height="7" rx="1" fill="currentColor"/></svg>`;

  // Show a subtle "continuing…" indicator inside the existing bubble
  const contIndicator = document.createElement('span');
  contIndicator.id = 'cont-indicator-' + aiIdx;
  contIndicator.style.cssText = 'color:var(--acc);font-size:11px;opacity:.7;margin-left:6px;animation:tpulse 1s ease infinite';
  contIndicator.textContent = '↩ continuing…';
  if (sEl) sEl.appendChild(contIndicator);

  let contFull = '';
  try {
    let res;
    if (isGemini) {
      // Gemini branch
      const geminiContents = [];
      const systemParts = [];
      for (const m of msgsForContinue) {
        if (m.role === 'system') { systemParts.push({ text: m.content }); continue; }
        const role = m.role === 'assistant' ? 'model' : 'user';
        const parts = typeof m.content === 'string' ? [{ text: m.content }] : [];
        if (parts.length) geminiContents.push({ role, parts });
      }
      const geminiBody = {
        contents: geminiContents,
        generationConfig: { temperature: S.cfg.temp, maxOutputTokens: contMaxTok, topP: S.cfg.topP },
      };
      if (systemParts.length) geminiBody.systemInstruction = { parts: systemParts };
      if (S.webSearchMode) geminiBody.tools = [{ google_search: {} }];
      const modelId = S.model.apiId || S.model.id;
      const ep = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(S.geminiKey)}`;
      res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiBody), signal: S.ac.signal });
    } else {
      const ep = isDeepSeek ? 'https://api.deepseek.com/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
      const auth = isDeepSeek ? S.deepseekKey : S.key;
      const extraH = isDeepSeek ? {} : { 'HTTP-Referer': location.href.startsWith('http') ? location.href : 'https://nexus-or.local', 'X-Title': 'Atlas' };
      const body = {
        model: (S.model.apiId || S.model.id).replace(/:(free|nitro|floor|beta)$/, ''),
        messages: msgsForContinue, stream: true,
        temperature: S.cfg.temp, max_tokens: contMaxTok, top_p: S.cfg.topP,
      };
      res = await fetch(ep, { method: 'POST', headers: { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json', ...extraH }, body: JSON.stringify(body), signal: S.ac.signal });
    }

    if (!res.ok) { let em = 'HTTP ' + res.status; try { const ed = await res.json(); em = ed?.error?.message || em; } catch {} throw new Error(em); }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') continue;
        let chunk; try { chunk = JSON.parse(payload); } catch { continue; }
        // OpenAI/OpenRouter
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) contFull += delta.content;
        // Gemini
        const gparts = chunk.candidates?.[0]?.content?.parts || [];
        contFull += gparts.filter(p => typeof p.text === 'string').map(p => p.text).join('');
        // Live render — append continuation to previous content
        if (sEl) {
          const combined = previousFull + contFull;
          const indicator = document.getElementById('cont-indicator-' + aiIdx);
          if (indicator) indicator.remove();
          sEl.innerHTML = renderMarkdown(combined, aiIdx);
          const newIndicator = document.createElement('span');
          newIndicator.id = 'cont-indicator-' + aiIdx;
          newIndicator.style.cssText = 'color:var(--acc);font-size:11px;opacity:.7;margin-left:6px;animation:tpulse 1s ease infinite';
          newIndicator.textContent = '↩ continuing…';
          sEl.appendChild(newIndicator);
        }
        scrollBottom();
        if (chunk.usage) {
          const aiMsg = S.msgs[aiIdx];
          if (aiMsg) { aiMsg.iTok += chunk.usage.prompt_tokens || 0; aiMsg.oTok += chunk.usage.completion_tokens || 0; aiMsg.cost = calcCost(aiMsg.iTok, aiMsg.oTok); S.totalCost += (chunk.usage.completion_tokens || 0) * (parseFloat(S.model?.pricing?.completion || 0)); updateCostDisplay(); }
        }
      }
    }
  } catch(e) {
    if (e.name !== 'AbortError') toast('Continue failed: ' + e.message, 'er');
  } finally {
    S.streaming = false;
    sendBtn.classList.remove('stop');
    sendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5h10M6.5 1.5l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    // Remove indicator
    const indicator = document.getElementById('cont-indicator-' + aiIdx);
    if (indicator) indicator.remove();
  }

  // Merge continuation into the existing AI message
  const newFull = previousFull + contFull;
  const aiMsg = S.msgs[aiIdx];
  if (aiMsg) {
    aiMsg.content = newFull;
    S.msgs[aiIdx] = aiMsg;
    const chat = S.convs.find(c => c.id === S.chatId);
    if (chat) chat.msgs = S.msgs;
    persist();
  }
  if (sEl) sEl.innerHTML = renderMarkdown(newFull, aiIdx);

  // Recurse — check if the continuation itself was also truncated
  await handleContinuation(aiIdx, newFull, sEl, mEl, aiRow);
}


// ── SEND MESSAGE ───────────────────────────────────────────────────────────
function setPrompt(t) { const el = document.getElementById('user-input'); el.value = t; autoResize(el); updateEst(); el.focus(); }
function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!S.streaming) sendMessage(); } }

async function sendMessage() {
  if (S.streaming) {
    S.ac?.abort();
    S.streaming = false;
    const _sb = document.getElementById('send-btn');
    if (_sb) { _sb.classList.remove('stop'); _sb.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5h10M6.5 1.5l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
    return;
  }

  const inp = document.getElementById('user-input');
  const text = inp.value.trim();
  if (!text && !S.files.length) return;
  
  // Reset detected intent for new message
  _detectedSkill = null;
  _detectedSkillDismissed = false;
  dismissDetectedIntent();
  
  const activeKey = S.provider === 'deepseek' ? S.deepseekKey : S.provider === 'gemini' ? S.geminiKey : S.provider === 'openai' ? S.openaiKey : S.provider === 'local' ? (S.localKey || 'local') : S.key;
  if (!activeKey) { openKeyModal(); return; }

  // Clarifying questions — only on first message of a conversation
  if (!_clarifyResolved) {
    const trigger = checkClarify(text);
    if (trigger) {
      showClarify(text, trigger);
      return; // pause sending — user picks an option or skips
    }
  }
  _clarifyResolved = false; // reset for next message

  // Check if image generation mode is active
  if (S.imageGenMode) {
    await sendImageGeneration(text);
    return;
  }

  if (!S.model) { toast('Please select a model first', 'er'); return; }
  if (S.budget > 0 && S.totalCost >= S.budget) { toast('Budget cap reached. Adjust in Settings.', 'er'); return; }

  // Create / update chat
  if (!S.chatId) {
    const id = Date.now() + '';
    S.convs.unshift({ id, title: text.slice(0, 40) || 'New conversation', msgs: [] });
    S.chatId = id; renderChatList();
  }
  const chat = S.convs.find(c => c.id === S.chatId);
  if (chat && chat.title === 'New conversation' && text) {
    chat.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
    renderChatList();
  }

  const uMsg = { role: 'user', content: text, files: [...S.files] };
  S.msgs.push(uMsg);
  inp.value = ''; autoResize(inp); updateEst();
  S.files = []; renderAttached();
  appendMsgEl(uMsg);
  // [ADDED] Auto-save after user message
  autoSaveConversation();

  // Thinking indicator
  const ca = document.getElementById('chat-area');
  const thinkRow = document.createElement('div');
  thinkRow.className = 'msg-row ai';
  const _thinkId = 'think-label-' + Date.now();
  thinkRow.innerHTML = `<div class="avatar aav" style="animation:atlasPulse 1.8s ease-in-out infinite">✦</div><div class="msg-body"><div class="msg-bubble" style="background:transparent;padding:6px 0"><div class="thinking-row"><div class="t-dots"><span></span><span></span><span></span></div><span class="thinking-label" id="${_thinkId}">Thinking…</span></div></div></div>`;
  // Cycle through thinking phrases
  const _thinkPhrases = ['Thinking…','Analyzing…','Reasoning…','Working on it…','Almost there…'];
  let _thinkIdx = 0;
  const _thinkTimer = setInterval(() => {
    _thinkIdx = (_thinkIdx + 1) % _thinkPhrases.length;
    const lbl = document.getElementById(_thinkId);
    if (lbl) lbl.textContent = _thinkPhrases[_thinkIdx];
    else clearInterval(_thinkTimer);
  }, 2000);
  thinkRow._thinkTimer = _thinkTimer;
  ca.appendChild(thinkRow); scrollBottom();

  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = false;
  sendBtn.classList.add('stop');
  sendBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="2" y="2" width="7" height="7" rx="1" fill="currentColor"/></svg>`;
  S.streaming = true; S.ac = new AbortController();

  // Smart skill auto-detection — runs before building payload
  await autoDetectSkill(text);

  // Build API payload
  const apiMsgs = buildApiMsgs();
  const sp = document.getElementById('sys-input').value.trim();
  // Detect edit intent — inject stored code blocks into system prompt only when needed
  // and only when Smart Patch Mode is enabled in settings.
  const smartPatchEnabled = S.cfg.smartPatch !== false;
  const editMode = smartPatchEnabled && isEditIntent(text);
  const sysParts = [];
  // Global system prompt — always first
  const globalSP = S.cfg.globalSysPrompt?.trim();
  if (globalSP) sysParts.push(globalSP);
  if (sp) sysParts.push(sp);
  // Inject active skill system prompt
  const skillPrompt = getSkillSystemPrompt();
  if (skillPrompt) sysParts.push(skillPrompt);
  if (editMode) sysParts.push(buildCodeStoreInjection(text));
  // Inject Don'ts preference
  const donts = S.cfg.donts?.trim();
  if (donts) sysParts.push('IMPORTANT — User preferences (Don\'ts):\n' + donts.split('\n').filter(Boolean).map(l => '- ' + l.replace(/^[-•*]\s*/,'')).join('\n'));

  // Output format injection — from button selection or keyword detection
  const detectedFmt = S.outputFmt || detectOutputFmt(text);
  if (detectedFmt && OUTPUT_FMT_CONFIG[detectedFmt]) {
    sysParts.push(buildFmtSystemPrompt(detectedFmt));
    if (!S.outputFmt) {
      // Auto-detected — show bar and highlight
      S.outputFmt = detectedFmt;
      const bar = document.getElementById('fmt-bar');
      bar.classList.remove('hidden');
      document.getElementById('fmt-btn').classList.add('active');
      renderFmtBar();
    }
  }

  // Only suggest filename comment for fresh code generation requests (not edits to existing code)
  const codeLikely = !editMode && /\b(write|create|build|generate|implement|program|make me a|make a)\b.*\b(script|function|class|component|app|game|website|webpage|api|bot|tool|html|css|javascript|python|java|rust|go|php|ruby|bash|sql)\b/i;
  if (codeLikely && codeLikely.test && codeLikely.test(text)) {
    sysParts.push('Start every code block\'s first line with a filename comment, e.g. `# filename: my_script.py` or `// filename: utils.js`.');
  }
  if (sysParts.length) apiMsgs.unshift({ role: 'system', content: sysParts.join('\n\n') });
  if (editMode) dbgLog('INFO', `Edit intent detected — injecting ${S.codeStore.size} block(s) into system prompt`);

  // Always use patch mode when in edit mode — prevents model from rewriting whole file
  const patchMode = editMode;
  // Boost max_tokens for code-heavy requests to reduce mid-generation cutoffs
  const isCodeRequest = !patchMode && /\b(write|create|build|generate|implement|make)\b/i.test(text) && /\b(html|css|js|javascript|python|script|component|app|game|function|class|page|website|code)\b/i.test(text);
  const effectiveMaxTok = patchMode ? 4096 : isCodeRequest ? Math.min(S.cfg.maxTok * 2, 32000) : S.cfg.maxTok;
  const requestBody = {
    model: (S.model.apiId || S.model.id).replace(/:(free|nitro|floor|beta)$/, ''),
    messages: apiMsgs,
    stream: true,
    temperature: patchMode ? 0.2 : S.cfg.temp,
    max_tokens: effectiveMaxTok,
    top_p: S.cfg.topP,
  };

  // Add tools if model supports it (not for Gemini — uses its own grounding API)
  if (hasToolUse(S.model) && S.provider !== 'gemini') {
    requestBody.tools = S.toolDefinitions;
    requestBody.tool_choice = 'auto';
  }
  // Web search plugin (OpenRouter only)
  if (S.webSearchMode && S.provider !== 'deepseek' && S.provider !== 'gemini') {
    requestBody.plugins = [{ id: 'web' }];
  }

  // Resolve endpoint and auth based on active provider
  const isDeepSeek = S.provider === 'deepseek';
  const isGemini   = S.provider === 'gemini';
  const isOpenAI   = S.provider === 'openai';
  const isLocal    = S.provider === 'local';

  // ── GEMINI BRANCH ─────────────────────────────────────────────────────────
  if (isGemini) {
    // thinkRow stays visible with animation until first token arrives
    const aiMsg = { role: 'assistant', content: '', iTok: 0, oTok: 0, cost: 0 };
    S.msgs.push(aiMsg);
    const aiIdx = S.msgs.length - 1;
    const sid = 'sc' + Date.now();
    const mid = 'sm' + Date.now();
    const aiRow = document.createElement('div');
    aiRow.className = 'msg-row ai';
    let _gemAiAppended = false;
    // Create sEl/mEl as detached elements first; append once we have content
    const sEl = document.createElement('div'); sEl.className = 'md-body'; sEl.id = sid;
    const mEl = document.createElement('div'); mEl.className = 'msg-meta'; mEl.id = mid;
    const _appendGemAiRow = () => {
      if (_gemAiAppended) return;
      _gemAiAppended = true;
      if (thinkRow._thinkTimer) clearInterval(thinkRow._thinkTimer);
      if (thinkRow.parentNode) thinkRow.remove();
      const av = document.createElement('div'); av.className = 'avatar aav'; av.textContent = '✦';
      const mb = document.createElement('div'); mb.className = 'msg-body';
      const bub = document.createElement('div'); bub.className = 'msg-bubble';
      bub.appendChild(sEl); mb.appendChild(bub); mb.appendChild(mEl);
      aiRow.appendChild(av); aiRow.appendChild(mb);
      ca.appendChild(aiRow); scrollBottom();
    };

    try {
      // Build Gemini contents array (convert OpenAI-style messages)
      const geminiContents = [];
      const systemParts = [];
      for (const m of apiMsgs) {
        if (m.role === 'system') { systemParts.push({ text: m.content }); continue; }
        const role = m.role === 'assistant' ? 'model' : 'user';
        const parts = [];
        if (typeof m.content === 'string') {
          parts.push({ text: m.content });
        } else if (Array.isArray(m.content)) {
          for (const part of m.content) {
            if (part.type === 'text') parts.push({ text: part.text });
            else if (part.type === 'image_url') {
              const url = part.image_url?.url || '';
              if (url.startsWith('data:')) {
                const [meta, b64] = url.split(',');
                const mimeType = meta.split(':')[1].split(';')[0];
                parts.push({ inlineData: { mimeType, data: b64 } });
              }
            }
          }
        }
        if (parts.length) geminiContents.push({ role, parts });
      }
      // Build system instruction from sysParts
      const geminiBody = {
        contents: geminiContents,
        generationConfig: {
          temperature: patchMode ? 0.2 : S.cfg.temp,
          maxOutputTokens: patchMode ? 4096 : S.cfg.maxTok,
          topP: S.cfg.topP,
        },
      };
      if (systemParts.length) {
        geminiBody.systemInstruction = { parts: systemParts };
      }

      // Add Google Search grounding tool for Gemini web search
      // Also add Google connector tools if signed in (Gemini supports function calling)
      if (_gTokenValid() && S.toolDefinitions.length > 0) {
        // Convert OpenAI-style tool definitions to Gemini functionDeclarations format
        const functionDeclarations = S.toolDefinitions
          .filter(t => t.type === 'function')
          .map(t => ({
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
          }));
        if (functionDeclarations.length > 0) {
          geminiBody.tools = geminiBody.tools || [];
          // Don't mix google_search grounding with function declarations — Gemini rejects that
          if (!S.webSearchMode) {
            geminiBody.tools.push({ function_declarations: functionDeclarations });
          }
        }
      } else if (S.webSearchMode) {
        geminiBody.tools = [{ google_search: {} }];
      }

      const modelId = (S.model.apiId || S.model.id);
      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(S.geminiKey)}`;

      const res = await fetch(geminiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
        signal: S.ac.signal,
      });

      if (!res.ok) {
        let em = 'HTTP ' + res.status;
        try { const ed = await res.json(); em = ed?.error?.message || em; } catch {}
        // Auto-retry on Gemini rate limit (429) — parse retryDelay from error message
        if (res.status === 429) {
          const secMatch = em.match(/retry.*?(\d+(?:\.\d+)?)s/i) || em.match(/(\d+(?:\.\d+)?)\s*s/i);
          const waitSec = secMatch ? Math.min(parseFloat(secMatch[1]) + 1, 65) : 15;
          // Show countdown in the thinking row
          const tspan = thinkRow.querySelector('span:last-child');
          let remaining = Math.ceil(waitSec);
          if (tspan) tspan.textContent = `Rate limit — retrying in ${remaining}s…`;
          toast(`⏳ Gemini rate limit — auto-retrying in ${remaining}s`, 'er');
          await new Promise(resolve => {
            const interval = setInterval(() => {
              remaining--;
              if (tspan) tspan.textContent = `Rate limit — retrying in ${remaining}s…`;
              if (remaining <= 0) { clearInterval(interval); resolve(); }
            }, 1000);
          });
          // Retry the request
          const retryRes = await fetch(geminiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody),
            signal: S.ac.signal,
          });
          if (!retryRes.ok) {
            let em2 = 'HTTP ' + retryRes.status;
            try { const ed2 = await retryRes.json(); em2 = ed2?.error?.message || em2; } catch {}
            throw new Error(em2);
          }
          // Use retryRes as res for the rest of the handler
          Object.defineProperty(res, '_retried', { value: retryRes });
          const retryReader = retryRes.body.getReader();
          const retryDecoder = new TextDecoder();
          let retryBuf = '', retryFull = '';
          while (true) {
            const { done, value } = await retryReader.read();
            if (done) break;
            retryBuf += retryDecoder.decode(value, { stream: true });
            const rlines = retryBuf.split('\n'); retryBuf = rlines.pop();
            for (const line of rlines) {
              if (!line.startsWith('data: ')) continue;
              const payload = line.slice(6).trim();
              if (!payload || payload === '[DONE]') continue;
              let chunk; try { chunk = JSON.parse(payload); } catch { continue; }
              const td = chunk.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
              if (td) { retryFull += td; if (sEl) sEl.innerHTML = renderMarkdown(retryFull, aiIdx); scrollBottom(); }
              if (chunk.usageMetadata) {
                aiMsg.iTok = chunk.usageMetadata.promptTokenCount || 0;
                aiMsg.oTok = chunk.usageMetadata.candidatesTokenCount || 0;
                aiMsg.cost = calcCost(aiMsg.iTok, aiMsg.oTok);
                S.totalCost += aiMsg.cost; updateCostDisplay();
              }
            }
          }
          aiMsg.content = retryFull;
          const retryPatches = extractPatches(retryFull);
          if (retryPatches?.length) {
            const { applied, failed, blockChanges } = applyPatches(retryPatches);
            let cleanProse = retryFull.replace(/```(?:patch|json)[\s\S]*?```/g, '').trim();
            if (!cleanProse) { const parts = []; for (const [bid,{changed,added}] of blockChanges.entries()) { const tot=changed.size+added.size; parts.push(`\`${bid}\` — ${tot} line${tot!==1?'s':''} updated`); } if(failed.length) parts.push(...failed.map(f=>`⚠ ${f}`)); cleanProse=parts.join('\n\n'); }
            if (sEl) sEl.innerHTML = renderMarkdown(cleanProse, S.msgs.length - 1);
            aiMsg.content = cleanProse;
            if (failed.length) failed.forEach(f => toast('Patch failed: ' + f, 'er'));
          }
          S.msgs[aiIdx] = aiMsg;
          if (chat) chat.msgs = S.msgs;
          persist(); updateCtxBar();
          if (mEl && (aiMsg.iTok || aiMsg.cost)) mEl.innerHTML = `<span class="meta-tok">${aiMsg.iTok + aiMsg.oTok} tokens</span>${aiMsg.cost ? `<span class="meta-cost">$${aiMsg.cost.toFixed(6)}</span>` : ''}<span>${S.model?.name || ''}</span>`;
          scrollBottom();
          if (S.msgNavOpen) renderMsgNav();
          return;
        }
        throw new Error(em);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', full = '', _gemFuncHandled = false;
      // Accumulate the ENTIRE model response parts array across SSE chunks.
      // For Gemini thinking models, the response is:
      //   parts[0] = { thought: true, thought_signature: "...", text: "..." }
      //   parts[1] = { functionCall: { name, args } }
      // We must send back the model turn with ALL parts exactly as received,
      // so thought parts carry their thought_signature into the follow-up.
      // Strategy: track parts by index, merge across chunks (text parts may stream).
      const _accModelParts = {};   // partIdx -> merged part object
      const _accFuncCallParts = []; // just the functionCall entries for execution

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === '[DONE]') continue;
          let chunk;
          try { chunk = JSON.parse(payload); } catch { continue; }
          // Extract text delta (skip non-text parts like functionCall)
          const parts = chunk.candidates?.[0]?.content?.parts || [];
          const textDelta = parts.filter(p => typeof p.text === 'string').map(p => p.text).join('');
          if (textDelta) {
            full += textDelta;
            _appendGemAiRow(); // show aiRow, hide thinkRow on first token
            sEl.innerHTML = renderMarkdown(full, aiIdx);
            scrollBottom();
          }

          // Accumulate ALL model parts by index across chunks (text streams, thought_signature
          // may arrive on a different chunk from the functionCall part).
          parts.forEach((p, i) => {
            if (!_accModelParts[i]) {
              // Deep clone the part so we own it
              _accModelParts[i] = Object.assign({}, p);
            } else {
              // Merge streaming updates into existing part entry
              if (p.text)             _accModelParts[i].text             = (_accModelParts[i].text || '') + p.text;
              if (p.thought_signature)_accModelParts[i].thought_signature = p.thought_signature;
              if (p.functionCall)     _accModelParts[i].functionCall      = p.functionCall;
              if (p.thought != null)  _accModelParts[i].thought           = p.thought;
            }
            // Track function call parts separately for execution
            if (p.functionCall && !_accFuncCallParts.find(e => e._partIdx === i)) {
              _accFuncCallParts.push({ functionCall: p.functionCall, _partIdx: i });
            } else if (p.functionCall) {
              // Update args if they streamed in later
              const existing = _accFuncCallParts.find(e => e._partIdx === i);
              if (existing) existing.functionCall = p.functionCall;
            }
          });

          // Detect function calls — set flag but do NOT execute yet.
          // thought_signature may arrive in a subsequent chunk, so we must
          // finish consuming the entire stream before building the follow-up.
          const funcCallParts = parts.filter(p => p.functionCall);
          if (funcCallParts.length > 0 && !_gemFuncHandled) {
            _gemFuncHandled = true;
          }
          // Show grounding sources if present
          const groundingMeta = chunk.candidates?.[0]?.groundingMetadata;
          if (groundingMeta?.searchEntryPoint?.renderedContent && sEl) {
            // Append a subtle "Sources" note — avoid clobbering main content
            const srcNote = groundingMeta.webSearchQueries?.length
              ? ' *(Search: ' + groundingMeta.webSearchQueries.join(', ') + ')*'
              : '';
            if (srcNote && !full.includes(srcNote)) full += '\n\n' + srcNote;
          }
          // Token usage
          if (chunk.usageMetadata) {
            aiMsg.iTok = chunk.usageMetadata.promptTokenCount || 0;
            aiMsg.oTok = chunk.usageMetadata.candidatesTokenCount || 0;
            aiMsg.cost = calcCost(aiMsg.iTok, aiMsg.oTok);
            S.totalCost += aiMsg.cost;
            updateCostDisplay();
          }
        }
      }

      // ── BUG 1 FIX: Execute tool calls AFTER stream completes so all thought_signatures are accumulated ──
      if (_gemFuncHandled && _accFuncCallParts.length > 0) {
        _appendGemAiRow();

        // Show indicators for all pending tool calls
        const indicators = [];
        for (const fc of _accFuncCallParts) {
          const ind = document.createElement('div');
          ind.style.cssText = 'font-size:11px;color:var(--acc);padding:3px 0;font-family:"DM Mono",monospace;opacity:.8;display:flex;align-items:center;gap:5px';
          ind.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--acc);animation:pulse 1s infinite"></span> Calling ${fc.functionCall.name}…`;
          sEl.appendChild(ind);
          indicators.push(ind);
        }
        scrollBottom();

        // Execute all tool calls (Google tools AND base tools like get_current_time)
        const toolResults = [];
        for (let fi = 0; fi < _accFuncCallParts.length; fi++) {
          const fc = _accFuncCallParts[fi];
          const { name, args } = fc.functionCall;
          try {
            let result = await _executeGoogleTool(name, JSON.stringify(args));
            if (result === null) {
              result = await executeToolCall({ name, arguments: args, id: name });
            }
            toolResults.push({ fc, name, args, result, ok: true });
            indicators[fi].querySelector('span').style.background = 'var(--grn)';
            indicators[fi].style.color = 'var(--grn)';
          } catch(toolErr) {
            const errMsg = toolErr?.message || String(toolErr);
            toolResults.push({ fc, name, args, result: { error: errMsg }, ok: false });
            indicators[fi].style.color = 'var(--red)';
            indicators[fi].innerHTML = `⚠ ${name}: ${errMsg.slice(0, 80)}`;
          }
        }

        // Build ONE combined follow-up request with all function responses.
        // Send back the ENTIRE model parts array exactly as received — this includes
        // thought parts ({ thought: true, thought_signature: "..." }) which Gemini
        // requires to validate the function calls. Without them, API returns HTTP 400.
        const sortedPartIndices = Object.keys(_accModelParts).map(Number).sort((a, b) => a - b);
        const modelParts = sortedPartIndices.map(i => {
          const p = _accModelParts[i];
          // Reconstruct clean part object — only include fields that are set
          const out = {};
          if (p.thought)           out.thought           = true;
          if (p.thought_signature) out.thought_signature = p.thought_signature;
          if (p.text != null)      out.text              = p.text || '';
          if (p.functionCall)      out.functionCall      = p.functionCall;
          return out;
        });
        const modelContent = { role: 'model', parts: modelParts };
        const userParts = toolResults.map(r => ({
          functionResponse: { name: r.name, response: r.result ?? { error: 'null result' } }
        }));

        const toolResultContents = [
          ...geminiContents,
          modelContent,
          { role: 'user', parts: userParts },
        ];
        const followupBody = { ...geminiBody, contents: toolResultContents };
        // Keep tools for multi-turn but remove google_search to avoid conflicts
        if (followupBody.tools) {
          followupBody.tools = followupBody.tools.filter(t => !t.google_search);
        }

        try {
          const fr = await fetch(geminiEndpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(followupBody), signal: S.ac.signal
          });
          if (fr.ok) {
            const frReader = fr.body.getReader(); const frDec = new TextDecoder(); let frBuf = '';
            let gotText = false;
            while (true) {
              const { done: fd, value: fv } = await frReader.read(); if (fd) break;
              frBuf += frDec.decode(fv, { stream: true });
              const flines = frBuf.split('\n'); frBuf = flines.pop();
              for (const fl of flines) {
                if (!fl.startsWith('data: ')) continue;
                let fc2; try { fc2 = JSON.parse(fl.slice(6).trim()); } catch { continue; }
                const fparts = fc2.candidates?.[0]?.content?.parts || [];
                const ftd = fparts.filter(p => typeof p.text === 'string').map(p => p.text).join('');
                if (ftd) {
                  if (!gotText) { indicators.forEach(ind => ind.remove()); gotText = true; }
                  full += ftd;
                  sEl.innerHTML = renderMarkdown(full, aiIdx);
                  scrollBottom();
                }
                if (fc2.usageMetadata) { aiMsg.oTok += fc2.usageMetadata.candidatesTokenCount || 0; }
              }
            }
            if (!gotText) {
              indicators.forEach(ind => ind.remove());
              const summary = toolResults.map(r => r.ok ? `✓ ${r.name}` : `✗ ${r.name}`).join(', ');
              full += `\n\n*Tool actions completed: ${summary}*`;
              sEl.innerHTML = renderMarkdown(full, aiIdx);
              scrollBottom();
            }
          } else {
            const errText = await fr.text().catch(() => '');
            let errMsg = errText.slice(0, 300);
            try { errMsg = JSON.parse(errText)?.error?.message || errMsg; } catch {}
            indicators.forEach(ind => ind.remove());
            const errDiv = document.createElement('div');
            errDiv.style.cssText = 'font-size:11px;color:var(--red);padding:4px 8px;background:var(--redd);border-radius:4px;margin-top:4px';
            errDiv.textContent = '⚠ Follow-up failed (HTTP ' + fr.status + '): ' + errMsg;
            sEl.appendChild(errDiv);
            scrollBottom();
          }
        } catch(followupErr) {
          console.warn('Gemini follow-up error:', followupErr);
          indicators.forEach(ind => ind.remove());
        }
      }

      aiMsg.content = full;
      // Check for patches
      const patches = extractPatches(full);
      if (patches && patches.length > 0) {
        const { applied, failed, blockChanges } = applyPatches(patches);
        let cleanProse = full.replace(/```patch[\s\S]*?```/g, '').trim();
        if (!cleanProse) {
          const parts = [];
          for (const [bid, { changed, added }] of blockChanges.entries()) {
            const total = changed.size + added.size;
            const addedNote = added.size ? ` (+${added.size} added)` : '';
            parts.push(`\`${bid}\` — ${total} line${total !== 1 ? 's' : ''} updated${addedNote}`);
          }
          if (failed.length) parts.push(...failed.map(f => `⚠ ${f}`));
          cleanProse = parts.join('\n\n');
        }
        if (sEl) sEl.innerHTML = renderMarkdown(cleanProse, S.msgs.length - 1);
        aiMsg.content = cleanProse;
        if (failed.length) failed.forEach(f => toast('Patch failed: ' + f, 'er'));
      }

      S.msgs[aiIdx] = aiMsg;
      if (chat) chat.msgs = S.msgs;
      persist(); updateCtxBar();
      // [ADDED] Auto-save after AI response
      autoSaveConversation();
      if (mEl && (aiMsg.iTok || aiMsg.cost)) {
        mEl.innerHTML = `<span class="meta-tok">${aiMsg.iTok + aiMsg.oTok} tokens</span>${aiMsg.cost ? `<span class="meta-cost">$${aiMsg.cost.toFixed(6)}</span>` : ''}<span>${S.model?.name || ''}</span>`;
      }
      scrollBottom();
      // ── Check for truncation and auto-continue if needed ──
      S.streaming = false;
      sendBtn.classList.remove('stop');
      sendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5h10M6.5 1.5l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      await handleContinuation(aiIdx, full, sEl, mEl, aiRow);
    } catch(e) {
      if (thinkRow._thinkTimer) clearInterval(thinkRow._thinkTimer);
      if (thinkRow.parentNode) thinkRow.remove();
      if (e.name !== 'AbortError') {
        const errRow = document.createElement('div');
        errRow.className = 'msg-row ai';
        errRow.innerHTML = `<div class="avatar aav">✦</div><div class="msg-body"><div class="msg-bubble" style="color:var(--red)"><strong>Gemini Error:</strong> ${esc(e.message)}</div></div>`;
        ca.appendChild(errRow); scrollBottom();
        toast(e.message, 'er');
      }
    } finally {
      S.streaming = false;
      sendBtn.classList.remove('stop');
      sendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5h10M6.5 1.5l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      // Final safety: remove thinkRow if no content arrived
      if (thinkRow.parentNode) { if (thinkRow._thinkTimer) clearInterval(thinkRow._thinkTimer); thinkRow.remove(); }
    }
    return; // ── END GEMINI BRANCH ──
  }

  const chatEndpoint = isDeepSeek
    ? 'https://api.deepseek.com/chat/completions'
    : isOpenAI
    ? 'https://api.openai.com/v1/chat/completions'
    : isLocal
    ? (S.localBaseUrl || 'http://localhost:11434').replace(/\/+$/, '') + '/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';
  const authKey = isDeepSeek ? S.deepseekKey : isOpenAI ? S.openaiKey : isLocal ? (S.localKey || 'none') : S.key;
  const extraHeaders = (isDeepSeek || isOpenAI || isLocal) ? {} : {
    'HTTP-Referer': location.href.startsWith('http') ? location.href : 'https://nexus-or.local',
    'X-Title': 'Atlas',
  };

  try {
    let res = await fetch(chatEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authKey}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(requestBody),
      signal: S.ac.signal,
    });

    // If web search plugin caused a failure, retry without it
    if (!res.ok && S.webSearchMode) {
      let errText = '';
      try { const ed = await res.clone().json(); errText = ed?.error?.message || ''; } catch {}
      if (res.status === 400 || res.status === 422 || errText.toLowerCase().includes('plugin')) {
        toast('⚠️ Web search unsupported by this model — retrying without it', 'er');
        S.webSearchMode = false;
        document.getElementById('web-search-btn').classList.remove('active');
        delete requestBody.plugins;
        res = await fetch(chatEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authKey}`,
            'Content-Type': 'application/json',
            ...extraHeaders,
          },
          body: JSON.stringify(requestBody),
          signal: S.ac.signal,
        });
      }
    }

    if (!res.ok) {
      let em = 'HTTP ' + res.status;
      try {
        const ed = await res.json();
        const raw = ed?.error?.message || ed?.error || ed?.message || '';
        if (raw.toLowerCase().includes('no allowed providers') || raw.toLowerCase().includes('no endpoints found')) {
          showAccountError();
          em = raw;
        } else if (res.status === 402 || raw.toLowerCase().includes('insufficient') || raw.toLowerCase().includes('credit')) {
          showAccountError();
          em = raw || em;
        } else {
          em = raw || em;
        }
      } catch {}
      throw new Error(em);
    }

    if (thinkRow._thinkTimer) clearInterval(thinkRow._thinkTimer);
  thinkRow.remove();
    const aiMsg = { role: 'assistant', content: '', iTok: 0, oTok: 0, cost: 0, toolCalls: [], toolResults: {} };
    S.msgs.push(aiMsg);
    const aiIdx = S.msgs.length - 1;

    const aiRow = document.createElement('div');
    aiRow.className = 'msg-row ai';
    const sid = 'sc' + Date.now();
    const mid = 'sm' + Date.now();
    aiRow.innerHTML = `<div class="avatar aav">✦</div><div class="msg-body"><div class="msg-bubble"><div class="md-body" id="${sid}"></div></div><div class="msg-meta" id="${mid}"></div></div>`;
    ca.appendChild(aiRow); scrollBottom();

    const sEl = document.getElementById(sid);
    const mEl = document.getElementById(mid);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', full = '';
    const toolCallBuffer = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        let chunk;
        try { chunk = JSON.parse(payload); } catch { continue; }

        if (chunk.error) {
          const em = chunk.error?.message || JSON.stringify(chunk.error);
          if (em.toLowerCase().includes('no allowed providers') || em.toLowerCase().includes('no endpoints found') ||
              em.toLowerCase().includes('insufficient') || em.toLowerCase().includes('credit')) {
            showAccountError();
          }
          throw new Error(em);
        }

        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        
        // Handle tool calls in stream
        if (delta?.tool_calls) {
          delta.tool_calls.forEach(tc => {
            const idx = tc.index || 0;
            if (!toolCallBuffer[idx]) toolCallBuffer[idx] = { id: '', function: { name: '', arguments: '' } };
            if (tc.id) toolCallBuffer[idx].id = tc.id;
            if (tc.function?.name) toolCallBuffer[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCallBuffer[idx].function.arguments += tc.function.arguments;
          });
        }

        // Handle text content
        if (delta?.content) {
          full += delta.content;
          if (sEl) {
            // Strip any in-progress patch block from the live display so the
            // raw JSON doesn't flash up while the model is still streaming it.
            const displayFull = full.replace(/```(?:patch|json)\s*\n?\{[\s\S]*?"patches"[\s\S]*?\}\s*\n?```/g, '').replace(/```patch[\s\S]*?```/g, '').replace(/```patch[\s\S]*$/, '');
            let displayContent = renderMarkdown(displayFull, aiIdx);
            // Show pending tool calls
            if (Object.keys(toolCallBuffer).length > 0) {
              const pendingTools = Object.values(toolCallBuffer).filter(tc => tc.function?.name);
              pendingTools.forEach(tc => {
                displayContent = renderToolCall({ function: tc.function, id: tc.id }, null, 'pending') + displayContent;
              });
            }
            sEl.innerHTML = displayContent;
          }
          scrollBottom();
        }

        if (chunk.usage) {
          aiMsg.iTok = chunk.usage.prompt_tokens || 0;
          aiMsg.oTok = chunk.usage.completion_tokens || 0;
          aiMsg.cost = calcCost(aiMsg.iTok, aiMsg.oTok);
          S.totalCost += aiMsg.cost;
          updateCostDisplay();
        }
      }
    }

    // Process tool calls after stream ends
    if (Object.keys(toolCallBuffer).length > 0) {
      const toolCalls = Object.values(toolCallBuffer).filter(tc => tc.function?.name);
      aiMsg.toolCalls = toolCalls;
      
      // Execute tools
      for (const tc of toolCalls) {
        try {
          const result = await executeToolCall(tc);
          aiMsg.toolResults[tc.id] = result;
        } catch(e) {
          aiMsg.toolResults[tc.id] = { error: e.message };
        }
      }
      
      // Re-render with tool results
      if (sEl) {
        let displayContent = renderMarkdown(full, aiIdx);
        toolCalls.forEach(tc => {
          const result = aiMsg.toolResults[tc.id];
          const status = result && !result.error ? 'done' : 'error';
          displayContent = renderToolCall(tc, result, status) + displayContent;
        });
        sEl.innerHTML = displayContent;
      }
      
      // Handle image generation results
      const imgToolCall = toolCalls.find(tc => tc.function?.name === 'generate_image');
      if (imgToolCall && aiMsg.toolResults[imgToolCall.id]?.images) {
        aiMsg.imageResult = aiMsg.toolResults[imgToolCall.id];
      }
    }

    // Save final content
    aiMsg.content = full;

    // ── PATCH EDIT: check if response contains a patch block ──
    const patches = extractPatches(full);
    if (patches && patches.length > 0) {
      const { applied, failed, blockChanges } = applyPatches(patches);
      let cleanProse = full.replace(/```(?:patch|json)[\s\S]*?```/g, '').trim();

      // If the AI sent no prose (just a patch block), synthesize a minimal
      // confirmation that links to each affected block so the message isn't empty.
      if (!cleanProse) {
        const parts = [];
        for (const [bid, { changed, added }] of blockChanges.entries()) {
          const total = changed.size + added.size;
          const addedNote = added.size ? ` (+${added.size} added)` : '';
          parts.push(`\`${bid}\` — ${total} line${total !== 1 ? 's' : ''} updated${addedNote}`);
        }
        if (failed.length) parts.push(...failed.map(f => `⚠ ${f}`));
        cleanProse = parts.join('\n\n');
      }

      if (sEl) sEl.innerHTML = renderMarkdown(cleanProse, S.msgs.length - 1);
      aiMsg.content = cleanProse;
      if (failed.length) failed.forEach(f => toast('Patch failed: ' + f, 'er'));
    }

    S.msgs[aiIdx] = aiMsg;
    if (chat) chat.msgs = S.msgs;
    persist();
    updateCtxBar();
    // [ADDED] Auto-save after AI response completes
    autoSaveConversation();

    if (mEl && (aiMsg.iTok || aiMsg.cost)) {
      mEl.innerHTML = `<span class="meta-tok">${aiMsg.iTok + aiMsg.oTok} tokens</span>${aiMsg.cost ? `<span class="meta-cost">$${aiMsg.cost.toFixed(6)}</span>` : ''}${aiMsg.imageCost ? `<span class="meta-cost" style="color:#ff6ab0">🖼️ $${aiMsg.imageCost.toFixed(4)}</span>` : ''}<span>${S.model?.name || ''}</span>`;
    }

    const codeBlocks = [...aiRow.querySelectorAll('.code-blk')];
    if (codeBlocks.length > 1) {
      const codes = codeBlocks.map((cb, i) => {
        const lang = cb.dataset.lang || cb.querySelector('.code-lang')?.textContent?.toLowerCase() || 'txt';
        const raw = cb.dataset.raw ? decodeURIComponent(escape(atob(cb.dataset.raw))) : cb.querySelector('pre')?.innerText || '';
        const ext = langExt(lang) || 'txt';
        return { code: raw, fn: extractFilename(raw, ext) };
      }).filter(c => c.code);
      if (codes.length > 1) {
        const bar = document.createElement('div');
        bar.className = 'dl-all-bar';
        const dlBtn = document.createElement('button');
        dlBtn.className = 'dl-all-btn';
        dlBtn.textContent = '⬇ Download All';
        dlBtn.addEventListener('click', () => downloadAll(codes));
        const lbl = document.createElement('span');
        lbl.className = 'dl-all-lbl';
        lbl.textContent = `📦 ${codes.length} files generated`;
        bar.appendChild(lbl);
        bar.appendChild(dlBtn);
        aiRow.querySelector('.msg-body').appendChild(bar);
      }
    }
    scrollBottom();
    // ── Check for truncation and auto-continue if needed ──
    // Must reset S.streaming before calling handleContinuation, otherwise
    // _doContinue's guard fires "already streaming" immediately
    S.streaming = false;
    sendBtn.classList.remove('stop');
    sendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5h10M6.5 1.5l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    await handleContinuation(aiIdx, full, sEl, mEl, aiRow);

  } catch (e) {
    // If web search plugin caused a network-level failure, retry without it
    if (e.name !== 'AbortError' && S.webSearchMode && e.message === 'Failed to fetch') {
      toast('⚠️ Web search unsupported by this model — retrying without it', 'er');
      S.webSearchMode = false;
      document.getElementById('web-search-btn').classList.remove('active');
      delete requestBody.plugins;
      try {
        const retryRes = await fetch(chatEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authKey}`,
            'Content-Type': 'application/json',
            ...extraHeaders,
          },
          body: JSON.stringify(requestBody),
          signal: S.ac.signal,
        });
        if (retryRes.ok) {
          // Re-run the full response handling by recursing — simplest approach
          // is to just inform the user and let them resend
          if (thinkRow.parentNode) thinkRow.remove();
          toast('Web search disabled. Please resend your message.', 'er');
          // Restore user message in input
          document.getElementById('user-input').value = text;
          autoResize(document.getElementById('user-input'));
          S.msgs.pop(); // remove the user message we already pushed
          renderChatList();
          return;
        }
      } catch {}
    }
    if (thinkRow.parentNode) thinkRow.remove();
    if (e.name !== 'AbortError') {
      const errRow = document.createElement('div');
      errRow.className = 'msg-row ai';
      errRow.innerHTML = `<div class="avatar aav">✦</div><div class="msg-body"><div class="msg-bubble" style="color:var(--red)"><strong>Error:</strong> ${esc(e.message)}</div></div>`;
      document.getElementById('chat-area').appendChild(errRow);
      scrollBottom();
      toast(e.message, 'er');
    }
  } finally {
    S.streaming = false;
    sendBtn.classList.remove('stop');
    sendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5h10M6.5 1.5l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
}

async function sendImageGeneration(prompt) {
  if (!prompt) return;
  
  const inp = document.getElementById('user-input');
  inp.value = ''; autoResize(inp); updateEst();
  
  // Create chat if needed
  if (!S.chatId) {
    const id = Date.now() + '';
    S.convs.unshift({ id, title: '🖼️ ' + prompt.slice(0, 35) + '…', msgs: [] });
    S.chatId = id; renderChatList();
  }
  const chat = S.convs.find(c => c.id === S.chatId);
  
  const uMsg = { role: 'user', content: '🖼️ Generate image: ' + prompt, files: [] };
  S.msgs.push(uMsg);
  appendMsgEl(uMsg);
  
  // Thinking indicator
  const ca = document.getElementById('chat-area');
  const thinkRow = document.createElement('div');
  thinkRow.className = 'msg-row ai';
  thinkRow.innerHTML = `<div class="avatar aav">✦</div><div class="msg-body"><div class="msg-bubble"><div class="thinking-row"><div class="t-dots"><span></span><span></span><span></span></div><span>Generating image…</span></div></div></div>`;
  ca.appendChild(thinkRow); scrollBottom();
  
  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = false;
  sendBtn.classList.add('stop');
  S.streaming = true;
  
  try {
    const result = await generateImage(prompt, S.cfg.imgSize);
    if (thinkRow._thinkTimer) clearInterval(thinkRow._thinkTimer);
  thinkRow.remove();
    
    if (result.error) {
      const errRow = document.createElement('div');
      errRow.className = 'msg-row ai';
      errRow.innerHTML = `<div class="avatar aav">✦</div><div class="msg-body"><div class="msg-bubble" style="color:var(--red)"><strong>Image generation failed:</strong> ${esc(result.error)}</div></div>`;
      ca.appendChild(errRow);
      toast(result.error, 'er');
      return;
    }
    
    const aiMsg = { 
      role: 'assistant', 
      content: `Generated image for: "${prompt}"`,
      imageResult: result,
      imageCost: 0.04,
    };
    S.msgs.push(aiMsg);
    
    if (chat) { chat.msgs = S.msgs; if (chat.title === 'New conversation') { chat.title = '🖼️ ' + prompt.slice(0, 35) + '…'; renderChatList(); } }
    
    const aiRow = document.createElement('div');
    aiRow.className = 'msg-row ai';
    aiRow.innerHTML = renderMsg(aiMsg, S.msgs.length - 1);
    ca.appendChild(aiRow);
    scrollBottom();
    persist();
    
    toast('🖼️ Image generated!', 'ok');
  } catch(e) {
    if (thinkRow._thinkTimer) clearInterval(thinkRow._thinkTimer);
  thinkRow.remove();
    toast('Image generation failed: ' + e.message, 'er');
  } finally {
    S.streaming = false;
    sendBtn.classList.remove('stop');
    sendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5h10M6.5 1.5l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
}

// ── RENDER MESSAGES CONTINUED ─────────────────────────────────────────────
function appendMsgEl(m) {
  const ca = document.getElementById('chat-area');
  // Remove either the static welcome div (id="welcome-static") or the JS-injected one (id="welcome")
  const wlc = document.getElementById('welcome') || document.getElementById('welcome-static');
  if (wlc) wlc.remove();
  const d = document.createElement('div');
  const idx = S.msgs.indexOf(m);
  d.innerHTML = renderMsg(m, idx >= 0 ? idx : S.msgs.length - 1);
  ca.appendChild(d.firstElementChild);
  scrollBottom();
  // Auto-open nav on first message (DeepSeek style)
  if (!S.msgNavOpen && window.innerWidth > 600) {
    S.msgNavOpen = true;
    document.getElementById('msg-nav').classList.add('open');
    document.getElementById('app').classList.add('mnav-open');
  }
  if (S.msgNavOpen) renderMsgNav();
}

function scrollBottom() {
  const ca = document.getElementById('chat-area');
  ca.scrollTop = ca.scrollHeight;
}

// ── MARKDOWN (unchanged) ──────────────────────────────────────────────────
function renderMarkdown(text, msgIdx) {
  const _mathBlocks = [];
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    const i = _mathBlocks.length;
    _mathBlocks.push({ type: 'block', tex });
    return '\uE000MATH' + i + '\uE000';
  });
  text = text.replace(/\$(?!\$)([^$\n]+?)\$/g, (_, tex) => {
    const i = _mathBlocks.length;
    _mathBlocks.push({ type: 'inline', tex });
    return '\uE000MATH' + i + '\uE000';
  });

  const codeBlocks = [];
  // Strip patch blocks before rendering — they are consumed by applyPatches, never shown
  text = text.replace(/```(?:patch|json)\s*\n?\{[\s\S]*?"patches"\s*:[\s\S]*?\}\s*\n?```/g, '');
  let h = text.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const langLC = lang.toLowerCase().trim();

    // Plain/unlabelled fenced blocks — render as a simple <pre>, not a full code box
    if (!langLC || langLC === 'text' || langLC === 'plain' || langLC === 'plaintext') {
      const placeholder = '\uE001CB' + codeBlocks.length + '\uE001';
      codeBlocks.push(`<pre class="plain-pre">${esc(code.trimEnd())}</pre>`);
      return placeholder;
    }

    const ext = langExt(lang);
    const _blkNum = codeBlocks.length;
    // Stable ID: based on message index + block position, not random
    // This ensures the same block always has the same ID across re-renders
    const _idSeed = (msgIdx !== undefined ? String(msgIdx) : 'x') + '|' + _blkNum;
    const id = 'cb' + _idSeed.split('').reduce((h,c)=>(((h<<5)-h+c.charCodeAt(0))|0),0x811c9dc5).toString(36).replace('-','n').slice(-6);
    const placeholder = '\uE001CB' + codeBlocks.length + '\uE001';
    const previewLangs = ['html','svg','jsx','js','javascript','python','py','c','cpp','java','go','rust','rb','ruby','php','r','swift','kotlin','kt','cs','csharp','bash','sh','matlab','octave'];
    const canPreview = previewLangs.includes(lang.toLowerCase());
    // Register in codeStore so the patch edit system can reference it.
    // Exclude patch/json blocks — those are patch instructions, not user code.
    // IMPORTANT: only register if codeStore doesn't already have a NEWER (patched)
    // version of this block — re-renders must not overwrite patched content with
    // the stale original that's baked into aiMsg.content.
    const isPatchBlock = lang === 'patch' || lang === 'json';
    if (!isPatchBlock && !S.codeStore.has(id)) {
      S.codeStore.set(id, { lang: lang || 'text', content: code.trimEnd(), srcMsgIdx: msgIdx });
    } else if (!isPatchBlock) {
      // Keep whatever is in codeStore (could be patched), but update the local
      // `code` variable so the rendered pre/data-raw reflects the latest content.
      code = S.codeStore.get(id).content;
    }
    // rawB64 must be computed AFTER the codeStore check so it reflects patched content
    const rawB64 = btoa(unescape(encodeURIComponent(code.trimEnd())));

    // Detect generated file types — show a special download button
    const fmtKey = lang === 'pdf-content' ? 'pdf' : lang === 'docx-content' ? 'docx' : lang === 'pptx-content' ? 'pptx' : null;
    let genDlBtn = '';
    if (fmtKey) {
      const cfg = OUTPUT_FMT_CONFIG[fmtKey];
      genDlBtn = `<button class="code-btn gen-dl" onclick="triggerFileGen('${id}','${fmtKey}')">${cfg.emoji} Download .${cfg.ext}</button>
                  <button class="code-btn preview" onclick="previewDocBlock('${id}','${fmtKey}')">▶ Preview</button>`;
    }

    codeBlocks.push(`<div class="code-blk" id="${id}" data-raw="${rawB64}" data-lang="${lang}">
      <div class="code-hdr">
        <span class="code-lang">${fmtKey ? OUTPUT_FMT_CONFIG[fmtKey].label + ' Output' : (lang || 'text')} <span class="code-blk-id">· ${id}</span></span>
        <div class="code-actions">
          <button class="code-btn cp" onclick="copyCode('${id}',this)">📋 Copy</button>
          ${genDlBtn}
          ${!fmtKey && ext ? `<button class="code-btn dl" onclick="downloadCode('${id}','${ext}')">⬇ .${ext}</button>` : ''}
          ${canPreview && !fmtKey ? `<button class="code-btn preview" onclick="previewCode('${id}')">▶ Preview</button>` : ''}
        </div>
      </div>
      <pre>${buildLineTable(highlightCode(esc(code.trimEnd()), lang))}</pre>
    </div>`);
    return placeholder;
  });

  h = esc(h);

  h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/((?:\|.+\|\n)+)/g, match => {
    const rows = match.trim().split('\n');
    let out = '<table>';
    rows.forEach((row, i) => {
      if (/^[\|\s\-:]+$/.test(row)) return;
      const cells = row.split('|').slice(1, -1).map(c => c.trim());
      const t = i === 0 ? 'th' : 'td';
      out += `<tr>${cells.map(c => `<${t}>${c}</${t}>`).join('')}</tr>`;
    });
    return out + '</table>';
  });
  h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  h = h.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  h = h.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  h = h.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/\n\n/g, '</p><p>');
  h = h.replace(/\n(?!<)/g, '<br>');
  if (!h.startsWith('<')) h = '<p>' + h + '</p>';

  codeBlocks.forEach((block, i) => {
    h = h.replace('\uE001CB' + i + '\uE001', block);
    h = h.replace(esc('\uE001CB' + i + '\uE001'), block);
  });

  _mathBlocks.forEach((m, i) => {
    const ph = m.type === 'block'
      ? '<span class="math-block-placeholder" data-tex="' + encodeURIComponent(m.tex) + '"></span>'
      : '<span class="math-inline-placeholder" data-tex="' + encodeURIComponent(m.tex) + '"></span>';
    h = h.replace('\uE000MATH' + i + '\uE000', ph);
    h = h.replace(esc('\uE000MATH' + i + '\uE000'), ph);
  });
  if (_mathBlocks.length > 0) { loadKatex(); setTimeout(renderAllMath, 50); }

  // Sanitize final HTML before returning — preserves all safe tags/attrs Atlas uses
  if (typeof DOMPurify !== 'undefined') {
    h = DOMPurify.sanitize(h, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['target','rel','onclick','data-raw','data-lang','data-tex','id','class','style'],
      FORCE_BODY: false,
      ALLOW_DATA_ATTR: true,
    });
  }

  return h;
}

function highlightCode(code, lang) {
  if (['python', 'py'].includes(lang))
    code = code
      .replace(/(#[^\n]*)/g, '<span class="tok-cmt">$1</span>')
      .replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\n]*"|'[^'\n]*')/g, '<span class="tok-str">$1</span>')
      .replace(/(?<![-\w"'=]|&[a-z]+;)\b(def|class|import|from|return|if|elif|else|for|while|in|not|and|or|True|False|None|try|except|with|as|pass|break|continue|lambda|yield|async|await)\b(?![^<]*>)/g, '<span class="tok-kw">$1</span>')
      .replace(/\b(\d+\.?\d*)\b(?![^<]*>)/g, '<span class="tok-num">$1</span>');
  else if (['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'].includes(lang))
    code = code
      .replace(/(\/\/[^\n]*)/g, '<span class="tok-cmt">$1</span>')
      .replace(/(`[^`]*`|"[^"\n]*"|'[^'\n]*')/g, '<span class="tok-str">$1</span>')
      .replace(/(?<![-\w"'=]|&[a-z]+;)\b(const|let|var|function|return|if|else|for|while|class|import|export|default|from|async|await|new|this|typeof|null|undefined|true|false|try|catch|throw)\b(?![^<]*>)/g, '<span class="tok-kw">$1</span>')
      .replace(/\b(\d+\.?\d*)\b(?![^<]*>)/g, '<span class="tok-num">$1</span>');
  return code;
}

// Build a line-numbered table from highlighted HTML code string
// changedLines: optional Set of 1-based line numbers to mark as changed
// newLines: optional Set of 1-based line numbers to mark as added (green)
function buildLineTable(highlightedHtml, changedLines, newLines) {
  const lines = highlightedHtml.split('\n');
  // Remove trailing empty line from trimEnd
  if (lines[lines.length - 1] === '') lines.pop();
  return '<div class="code-tbl">' + lines.map((ln, i) => {
    const n = i + 1;
    let cls = 'code-ln';
    if (newLines?.has(n)) cls += ' changed-add';
    else if (changedLines?.has(n)) cls += ' changed';
    return `<div class="${cls}" data-ln="${n}"><span class="ln-num">${n}</span><span class="ln-code">${ln || ' '}</span></div>`;
  }).join('') + '</div>';
}

function langExt(l) {
  const m = {
    python:'py', py:'py', javascript:'js', js:'js', typescript:'ts', ts:'ts',
    jsx:'jsx', tsx:'tsx', html:'html', css:'css', json:'json', bash:'sh', sh:'sh',
    sql:'sql', rust:'rs', go:'go', cpp:'cpp', c:'c', java:'java', kotlin:'kt',
    swift:'swift', php:'php', ruby:'rb', r:'r', yaml:'yaml', yml:'yml',
    toml:'toml', markdown:'md', md:'md', xml:'xml', csv:'csv', txt:'txt',
    // File generation tags — no raw download, handled by triggerFileGen
    'pdf-content': null, 'docx-content': null, 'pptx-content': null
  };
  const key = l?.toLowerCase();
  if (!key) return null;
  // Explicit null means "known but no download" (file-gen tags)
  if (Object.prototype.hasOwnProperty.call(m, key)) return m[key];
  // Unknown language — still offer .txt only for short recognizable names, not hyphenated tags
  return key.includes('-') ? null : (key.length <= 10 ? 'txt' : null);
}

// Dispatch file generation from a code block
async function triggerFileGen(blockId, fmt) {
  const blk = document.getElementById(blockId);
  if (!blk) return;
  const raw = blk.dataset.raw ? decodeURIComponent(escape(atob(blk.dataset.raw))) : blk.querySelector('pre')?.innerText || '';
  const ts = new Date().toISOString().slice(0,10);
  // Extract title from JSON for a meaningful filename
  let baseName = '';
  try {
    const d = parseModelJSON(raw);
    baseName = (d.title || '').replace(/[^a-z0-9\s-]/gi,'').trim().replace(/\s+/g,'-').slice(0,40);
  } catch(e) {}
  if (!baseName) baseName = fmt === 'pptx' ? 'presentation' : 'document';
  const filename = `${baseName}-${ts}.${fmt}`;
  try {
    if (fmt === 'pdf') await generatePDF(raw, filename);
    else if (fmt === 'docx') await generateDOCX(raw, filename);
    else if (fmt === 'pptx') await generatePPTX(raw, filename);

    // ── Update model context so AI knows the file was generated ──────
    // Update codeStore entry so the model's next message references the final file
    const existing = S.codeStore.get(blockId);
    if (existing) {
      existing.lastGenerated = { filename, fmt, ts };
      S.codeStore.set(blockId, existing);
    }
    // Find matching artifact and tag it
    const art = _artifacts[blockId] || Object.values(_artifacts).find(a => a.id === blockId);
    if (art) {
      art._lastGenerated = { filename, fmt, ts };
      // Refresh the source block's dataset so subsequent edits carry the info
      blk.dataset.lastGenerated = JSON.stringify({ filename, fmt, ts });
    }
    // Persist conversation so model context is saved
    const chat = S.convs.find(c => c.id === S.chatId);
    if (chat) { chat.codeStore = Array.from(S.codeStore.entries()); }
    persist();
  } catch(e) {
    toast('File generation failed: ' + e.message, 'er');
  }
}

function copyCode(id, btn) {
  const blk = document.getElementById(id);
  if (!blk) return;
  const raw = blk.dataset.raw ? decodeURIComponent(escape(atob(blk.dataset.raw))) : blk.querySelector('pre')?.innerText || '';
  navigator.clipboard.writeText(raw).then(() => {
    btn.textContent = '✓ Copied'; btn.classList.add('done');
    setTimeout(() => { btn.textContent = '📋 Copy'; btn.classList.remove('done'); }, 2000);
  });
}

function extractFilename(code, ext) {
  // Search first 5 lines for a filename comment
  const lines = code.split('\n').slice(0, 5);
  for (const line of lines) {
    const m = line.match(/filename[:\s]+([\w\-. ]+\.\w+)/i)
           || line.match(/file[:\s]+([\w\-. ]+\.\w+)/i)
           || line.match(/^[#\/\*]+\s*([\w\-]+\.\w+)\s*$/);
    if (m) {
      const name = m[1].trim().replace(/\s+/g, '_');
      return name.includes('.') ? name : name + '.' + ext;
    }
  }
  // Fallback: derive from code content
  const titleMatch = code.match(/(?:title|name|app)[:\s]+["\'`]([\w\s\-]+)["\'`]/i);
  if (titleMatch) {
    const slug = titleMatch[1].trim().toLowerCase().replace(/[^\w]+/g, '_').slice(0, 30);
    return slug + '.' + ext;
  }
  return `file.${ext}`;
}

function downloadCode(id, ext) {
  const blk = document.getElementById(id);
  if (!blk) return;
  const raw = blk.dataset.raw ? decodeURIComponent(escape(atob(blk.dataset.raw))) : blk.querySelector('pre')?.innerText || '';
  const mimeMap = { css:'text/css', html:'text/html', js:'text/javascript', ts:'text/typescript', json:'application/json', svg:'image/svg+xml', xml:'application/xml', csv:'text/csv', sh:'text/x-sh', py:'text/x-python', md:'text/markdown' };
  const mime = mimeMap[ext] || 'text/plain';
  const blob = new Blob([raw], { type: mime });
  const url = URL.createObjectURL(blob);
  const filename = extractFilename(raw, ext);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast(`Downloaded ${filename}`, 'ok');
}

function downloadAll(codes) {
  codes.forEach(c => {
    const blob = new Blob([c.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = c.fn; a.click();
    URL.revokeObjectURL(url);
  });
  toast(`Downloaded ${codes.length} files`, 'ok');
}

// ── FILES ──────────────────────────────────────────────────────────────────
function fileIcon(t) {
  if (t.startsWith('image/')) return '🖼️';
  if (t === 'application/pdf') return '📄';
  if (t.includes('csv')) return '📊';
  if (t.includes('json')) return '📋';
  return '📝';
}
async function attachFiles(files) {
  for (const f of files) {
    const data = await readFile(f);
    S.files.push({ name: f.name, type: f.type, size: f.size, data });
  }
  renderAttached();
  document.getElementById('file-input').value = '';
  document.getElementById('send-btn').disabled = false;
}
function readFile(f) {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    if (f.type.startsWith('image/') || f.type === 'application/pdf') {
      // readAsDataURL gives us the base64 data URL directly; strip the prefix
      r.onload = e => {
        const dataUrl = e.target.result;
        const base64 = dataUrl.split(',')[1] || dataUrl;
        ok(base64);
      };
      r.onerror = fail;
      r.readAsDataURL(f);
    } else {
      r.onload = e => ok(e.target.result);
      r.onerror = fail;
      r.readAsText(f);
    }
  });
}
function renderAttached() {
  document.getElementById('attached-files').innerHTML = S.files.map((f, i) =>
    `<div class="att-file">
      <span>${fileIcon(f.type)}</span>
      <span>${esc(f.name)}</span>
      <span style="color:var(--tx3);font-size:10px">${fmtBytes(f.size)}</span>
      <button class="att-file-rm" onclick="removeFile(${i})">✕</button>
    </div>`
  ).join('');
}
function removeFile(i) { S.files.splice(i, 1); renderAttached(); }

// ── PASTE IMAGE ────────────────────────────────────────────────────────────
document.addEventListener('paste', e => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const imageItems = Array.from(items).filter(it => it.kind === 'file' && it.type.startsWith('image/'));
  if (!imageItems.length) return;
  e.preventDefault();
  const files = imageItems.map(it => it.getAsFile()).filter(Boolean);
  if (files.length) attachFiles(files);
});
function fmtBytes(b) {
  if (b < 1024) return b + 'B';
  if (b < 1048576) return (b / 1024).toFixed(1) + 'KB';
  return (b / 1048576).toFixed(1) + 'MB';
}

// ── COST ───────────────────────────────────────────────────────────────────
// Gemini models that have a free tier via Google AI Studio (no charge up to generous daily limits)
const GEMINI_FREE_MODELS = new Set([
  'gemini-2.5-flash-preview-04-17', 'gemini-2.5-flash-preview-05-20', 'gemini-2.5-flash',
  'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash-exp',
  'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-flash-latest',
  'gemini-1.5-pro', 'gemini-1.5-pro-latest',
]);
function isGeminiFreeModel() {
  if (S.provider !== 'gemini' || !S.model) return false;
  const id = (S.model.apiId || S.model.id || '').toLowerCase();
  for (const freeId of GEMINI_FREE_MODELS) {
    if (id.includes(freeId) || id.startsWith(freeId)) return true;
  }
  return true; // All Gemini models via AI Studio key have a free tier
}

function calcCost(i, o) {
  if (!S.model) return 0;
  // Local and Gemini providers are free (no billing)
  if (S.provider === 'gemini' && !S.cfg.geminiTrackCost) return 0;
  if (S.provider === 'local') return 0;
  return i * parseFloat(S.model.pricing?.prompt || 0) + o * parseFloat(S.model.pricing?.completion || 0);
}

function updateCostDisplay() {
  const el = document.getElementById('cost-val');
  const isGeminiFree = S.provider === 'gemini' && !S.cfg.geminiTrackCost;
  const isLocalFree  = S.provider === 'local';
  if (isGeminiFree || isLocalFree) {
    el.textContent = isLocalFree ? 'Local' : 'Free*';
    el.className = '';
    el.title = isLocalFree ? 'Running on your local machine — no API costs' : 'Using Google AI Studio free tier — no charges for standard usage limits';
    document.getElementById('modal-cost').textContent = isLocalFree ? '$0.0000 (local inference)' : '$0.0000 (Gemini free tier)';
    document.getElementById('budget-bar-wrap').classList.remove('vis');
    document.getElementById('budget-disp').textContent = isLocalFree ? 'Local' : 'Free tier';
    return;
  }
  el.title = '';
  el.textContent = `$${S.totalCost.toFixed(4)}`;
  document.getElementById('modal-cost').textContent = `$${S.totalCost.toFixed(4)}`;
  const r = S.budget > 0 ? S.totalCost / S.budget : 0;
  el.className = r > 0.9 ? 'danger' : r > 0.6 ? 'warn' : '';
  const bar = document.getElementById('budget-bar');
  bar.className = r > 0.9 ? 'danger' : r > 0.6 ? 'warn' : '';
  if (S.budget > 0) {
    document.getElementById('budget-bar-wrap').classList.add('vis');
    bar.style.width = Math.min(r * 100, 100) + '%';
    document.getElementById('budget-disp').textContent = `/ $${S.budget.toFixed(2)}`;
  } else {
    document.getElementById('budget-bar-wrap').classList.remove('vis');
    document.getElementById('budget-disp').textContent = 'No budget';
  }
}

function resetCost() { S.totalCost = 0; updateCostDisplay(); toast('Cost counter reset', 'ok'); }

function updateEst() {
  const text = document.getElementById('user-input').value;
  const tok = Math.ceil(text.length / 4);
  const te = document.getElementById('tok-est'), ce = document.getElementById('cost-est');
  if (text.length > 0) {
    te.textContent = `~${tok} tokens`; te.style.opacity = '1';
    if (S.model && !S.imageGenMode) {
      if (S.provider === 'gemini') {
        ce.textContent = 'Free (Google quota)'; ce.style.opacity = '1'; ce.style.color = 'var(--grn)';
      } else if (S.provider === 'local') {
        ce.textContent = 'Free (local)'; ce.style.opacity = '1'; ce.style.color = 'var(--grn)';
      } else {
        ce.textContent = `~$${(tok * parseFloat(S.model.pricing?.prompt || 0)).toFixed(6)} input`; ce.style.opacity = '1';
      }
    }
    else if (S.imageGenMode) { ce.textContent = '~$0.04 image'; ce.style.opacity = '1'; ce.style.color = '#ff6ab0'; }
  } else { te.style.opacity = '0'; ce.style.opacity = '0'; ce.style.color = 'var(--grn)'; }
  document.getElementById('send-btn').disabled = !text.trim() && !S.files.length;
}

// ── SETTINGS ───────────────────────────────────────────────────────────────
// ── SETTINGS ───────────────────────────────────────────────────────────────
let _settingsOrigFont = null, _settingsOrigFontSize = null;
function closeSettings() {
  if (_settingsOrigFont !== null) {
    applyFont(_settingsOrigFont, _settingsOrigFontSize || 14);
    _settingsOrigFont = null; _settingsOrigFontSize = null;
  }
  const overlay = document.querySelector('.modal-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.classList.remove('open');
  }
  document.getElementById('settings-modal').style.display = 'none';
  document.getElementById('settings-modal').classList.remove('open');
}

function saveSettings() {
  S.cfg.temp = parseFloat(document.getElementById('sl-temp').value);
  S.cfg.maxTok = parseInt(document.getElementById('sl-maxtok').value);
  S.cfg.topP = parseFloat(document.getElementById('sl-topp').value);
  S.cfg.imgSize = document.getElementById('sl-img-size').value;
  S.cfg.imgModel = document.getElementById('sl-img-model').value;
  S.cfg.donts = document.getElementById('donts-input').value.trim();
  S.cfg.globalSysPrompt = document.getElementById('global-sysprompt-input').value.trim();
  S.cfg.font = document.getElementById('sl-font').value;
  S.cfg.fontSize = parseInt(document.getElementById('sl-fontsize').value);
  S.cfg.chatDensity = parseInt(document.getElementById('sl-density').value);
  S.cfg.smartPatch = document.getElementById('toggle-smart-patch').checked;
  // geminiTrackCost is auto-detected, not set manually
  applyFont(S.cfg.font, S.cfg.fontSize);
  _settingsOrigFont = null; _settingsOrigFontSize = null; // clear so closeSettings won't revert
  previewChatDensity(S.cfg.chatDensity);
  const b = parseFloat(document.getElementById('budget-input').value);
  S.budget = isNaN(b) || b <= 0 ? 0 : b;
  updateCostDisplay(); closeSettings(); persist(); toast('Settings saved', 'ok');
}

// ── SYSTEM PROMPT ──────────────────────────────────────────────────────────
function toggleSys() {
  document.getElementById('sys-bar').classList.toggle('open');
  document.getElementById('sys-btn').classList.toggle('active');
}

// ── UTILS ──────────────────────────────────────────────────────────────────
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  const icons = { ok: '✓', er: '✕', '': 'ℹ' };
  el.innerHTML = `<span style="color:${type === 'ok' ? 'var(--grn)' : type === 'er' ? 'var(--red)' : 'var(--acc)'}">${icons[type] || 'ℹ'}</span> ${esc(msg)}`;
  el.className = `show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = type; }, 3400);
}

// ── PERSISTENCE ────────────────────────────────────────────────────────────
// [CHANGED] Secure storage system: IndexedDB for conversations, Credential API for keys
const STORAGE_KEY = 'nexus_v2_image_tools';  // kept for non-sensitive settings only
const ATLAS_DB_NAME = 'AtlasDB';
const ATLAS_DB_VERSION = 1;
const ATLAS_STORE = 'conversations';
const ATLAS_SETTINGS_KEY = 'atlas_settings_v1'; // non-sensitive settings in localStorage

// ── [ADDED] ChatStorage class — IndexedDB for conversation history ──────────
const ChatStorage = (() => {
  let _db = null;

  async function init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(ATLAS_DB_NAME, ATLAS_DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(ATLAS_STORE)) {
          db.createObjectStore(ATLAS_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror = e => { console.warn('Atlas: IndexedDB open failed', e); reject(e); };
    });
  }

  function _tx(mode) {
    if (!_db) throw new Error('DB not initialized');
    return _db.transaction(ATLAS_STORE, mode).objectStore(ATLAS_STORE);
  }

  async function saveConversation(conv) {
    return new Promise((resolve, reject) => {
      try {
        const req = _tx('readwrite').put({
          id: conv.id,
          title: conv.title,
          codeStore: conv.codeStore || [],
          msgs: (conv.msgs || []).slice(-40).map(m => ({
            role: m.role,
            content: m.content,
            files: (m.files || []).filter(f => !f.type?.startsWith('image/')).map(f => ({ name: f.name, type: f.type })),
            iTok: m.iTok, oTok: m.oTok, cost: m.cost,
            imageResult: m.imageResult ? { prompt: m.imageResult.prompt, images: m.imageResult.images?.map(img => ({ url: img.url })) } : null,
            imageCost: m.imageCost,
            toolCalls: m.toolCalls?.map(tc => ({ id: tc.id, function: { name: tc.function.name, arguments: tc.function.arguments } })),
            toolResults: m.toolResults,
          }))
        });
        req.onsuccess = () => resolve();
        req.onerror = e => reject(e);
      } catch(e) { reject(e); }
    });
  }

  async function loadAllConversations() {
    return new Promise((resolve, reject) => {
      try {
        const req = _tx('readonly').getAll();
        req.onsuccess = e => resolve(e.target.result || []);
        req.onerror = e => reject(e);
      } catch(e) { reject(e); }
    });
  }

  async function deleteConversation(id) {
    return new Promise((resolve, reject) => {
      try {
        const req = _tx('readwrite').delete(id);
        req.onsuccess = () => resolve();
        req.onerror = e => reject(e);
      } catch(e) { reject(e); }
    });
  }

  async function getStorageEstimate() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        return { usage: est.usage || 0, quota: est.quota || 0 };
      }
    } catch(e) {}
    return { usage: 0, quota: 0 };
  }

  async function clearAll() {
    return new Promise((resolve, reject) => {
      try {
        const req = _tx('readwrite').clear();
        req.onsuccess = () => resolve();
        req.onerror = e => reject(e);
      } catch(e) { reject(e); }
    });
  }

  return { init, saveConversation, loadAllConversations, deleteConversation, getStorageEstimate, clearAll };
})();

// ── [ADDED] Secure key storage — Credential API + sessionStorage fallback ──
// Tracks how keys are currently stored: 'credential' | 'session' | 'none'
const KeyStore = (() => {
  const _SESSION_PREFIX = 'atlas_key_sess_';
  const _CRED_PREFIX    = 'atlas_key_';

  // PasswordCredential availability check
  function _credAvailable() {
    return typeof PasswordCredential !== 'undefined' && typeof navigator.credentials?.store === 'function';
  }

  // [CHANGED] Save key — NEVER uses localStorage
  async function saveKey(provider, key, persistent) {
    // Always save to sessionStorage as immediate fallback
    try { sessionStorage.setItem(_SESSION_PREFIX + provider, key); } catch(e) {}

    if (persistent && _credAvailable()) {
      try {
        const cred = new PasswordCredential({
          id: _CRED_PREFIX + provider,
          password: key,
          name: 'Atlas AI — ' + provider,
        });
        await navigator.credentials.store(cred);
        return 'credential';
      } catch(e) {
        console.warn('Atlas: Credential API store failed, using sessionStorage only', e);
      }
    }
    return 'session';
  }

  // Load all keys — tries Credential API first, then sessionStorage, NEVER localStorage
  async function loadKeys() {
    const providers = ['openrouter', 'deepseek', 'gemini', 'openai', 'local'];
    const keys = {};
    let source = 'none';

    // Try Credential API
    if (_credAvailable()) {
      for (const p of providers) {
        try {
          const cred = await navigator.credentials.get({ password: true, mediation: 'silent', id: _CRED_PREFIX + p });
          if (cred && cred.password) {
            keys[p] = cred.password;
            source = 'credential';
          }
        } catch(e) { /* silent */ }
      }
    }

    // Fill any missing keys from sessionStorage
    for (const p of providers) {
      if (!keys[p]) {
        try {
          const v = sessionStorage.getItem(_SESSION_PREFIX + p);
          if (v) { keys[p] = v; if (source === 'none') source = 'session'; }
        } catch(e) {}
      }
    }

    return { keys, source };
  }

  // Clear all key storage (session + credential)
  async function clearKeys() {
    const providers = ['openrouter', 'deepseek', 'gemini', 'openai', 'local'];
    for (const p of providers) {
      try { sessionStorage.removeItem(_SESSION_PREFIX + p); } catch(e) {}
      if (_credAvailable()) {
        try { await navigator.credentials.preventSilentAccess(); } catch(e) {}
      }
    }
  }

  async function saveCurrentKey(persistent) {
    const p = S.provider || 'openrouter';
    const key = p === 'deepseek' ? S.deepseekKey
               : p === 'gemini'  ? S.geminiKey
               : p === 'openai'  ? S.openaiKey
               : p === 'local'   ? JSON.stringify({ baseUrl: S.localBaseUrl, key: S.localKey })
               : S.key;
    if (!key) { toast('No active API key to save', 'er'); return; }
    const result = await saveKey(p, key, persistent);
    return result;
  }

  return { saveKey, loadKeys, clearKeys, saveCurrentKey, credAvailable: _credAvailable };
})();

// ── [ADDED] Key security status UI updater ─────────────────────────────────
let _currentKeySource = 'none';

function updateSecurityStatus(source) {
  _currentKeySource = source;
  const icon = document.getElementById('sec-status-icon');
  const settIcon = document.getElementById('key-security-icon');
  const settLabel = document.getElementById('key-security-label');
  const settSub = document.getElementById('key-security-sub');

  const hasKey = S.key || S.deepseekKey || S.geminiKey || S.openaiKey || S.localBaseUrl;

  if (!hasKey) {
    if (icon) icon.textContent = '🔑';
    if (settIcon) settIcon.textContent = '🔑';
    if (settLabel) settLabel.textContent = 'No API key';
    if (settSub) settSub.textContent = 'Enter a key to get started';
  } else if (source === 'credential') {
    if (icon) icon.textContent = '🔒';
    if (settIcon) settIcon.textContent = '🔒';
    if (settLabel) settLabel.textContent = 'Secured in browser password manager';
    if (settSub) settSub.textContent = 'Key is protected by the Credential Management API';
  } else if (source === 'session') {
    if (icon) icon.textContent = '⚠️';
    if (settIcon) settIcon.textContent = '⚠️';
    if (settLabel) settLabel.textContent = 'Session only — will be cleared on tab close';
    if (settSub) settSub.textContent = 'Click "Save in browser" to persist securely';
  } else {
    if (icon) icon.textContent = '⚠️';
    if (settIcon) settIcon.textContent = '⚠️';
    if (settLabel) settLabel.textContent = 'Key stored in memory only';
    if (settSub) settSub.textContent = 'Will be lost on page refresh';
  }
}

// [ADDED] Show "Saved" indicator after auto-save
let _savedIndicatorTimer = null;
function showSavedIndicator() {
  let el = document.getElementById('auto-save-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'auto-save-indicator';
    el.style.cssText = 'position:fixed;bottom:80px;right:16px;padding:4px 10px;background:var(--grnd);border:1px solid rgba(45,212,160,.3);border-radius:var(--rx);font-size:11px;color:var(--grn);z-index:50;opacity:0;transition:opacity .2s;pointer-events:none';
    el.textContent = '✓ Saved';
    document.body.appendChild(el);
  }
  el.style.opacity = '1';
  clearTimeout(_savedIndicatorTimer);
  _savedIndicatorTimer = setTimeout(() => { el.style.opacity = '0'; }, 1500);
}

// [ADDED] Auto-save current conversation to IndexedDB
async function autoSaveConversation() {
  const c = S.convs.find(x => x.id === S.chatId);
  if (!c) return;
  c.msgs = S.msgs;
  c.codeStore = Array.from(S.codeStore.entries());
  try {
    await ChatStorage.saveConversation(c);
    showSavedIndicator();
  } catch(e) {
    console.warn('Atlas: auto-save failed', e);
  }
}

// ── [CHANGED] SafeStorage — now only for NON-SENSITIVE settings ─────────────
// API keys are NEVER written here
const SafeStorage = (() => {
  let _cache = null;
  let _available = null;

  function isAvailable() {
    if (_available !== null) return _available;
    try {
      const t = '__nexus_test__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      _available = true;
    } catch(e) { _available = false; }
    return _available;
  }

  return {
    get(key) {
      if (isAvailable()) {
        try { return localStorage.getItem(key); } catch(e) {}
      }
      return _cache ? _cache[key] || null : null;
    },
    set(key, val) {
      if (isAvailable()) {
        try { localStorage.setItem(key, val); return true; } catch(e) {}
      }
      if (!_cache) _cache = {};
      _cache[key] = val;
      return false;
    },
    remove(key) {
      if (isAvailable()) { try { localStorage.removeItem(key); } catch(e) {} }
      if (_cache) delete _cache[key];
    },
    available() { return isAvailable(); }
  };
})();

// [CHANGED] persist() — NEVER stores API keys. Only non-sensitive settings in localStorage.
// Conversations are saved via autoSaveConversation() → IndexedDB.
function persist() {
  try {
    const data = {
      // [REMOVED] key, deepseekKey, geminiKey, openaiKey — NEVER stored here
      provider: S.provider || 'openrouter',
      localBaseUrl: S.localBaseUrl || 'http://localhost:11434',
      deepseekModels: S._deepseekModels || null,
      geminiModels: S._geminiModels || null,
      openaiModels: S.openaiModels || [],
      model: S.model ? { id: S.model.id, name: S.model.name, pricing: S.model.pricing, context_length: S.model.context_length, architecture: S.model.architecture } : null,
      // [REMOVED] convs — stored in IndexedDB
      chatId: S.chatId,
      totalCost: S.totalCost,
      budget: S.budget,
      cfg: S.cfg,
      smartPatch: S.cfg.smartPatch === false ? false : true,
      sysprompt: document.getElementById('sys-input')?.value || '',
      theme: S.theme || 'dark',
      imageGenMode: S.imageGenMode,
      webSearchMode: S.webSearchMode,
      favModels: S.favModels || [],
      lastModelByProvider: S._lastModelByProvider || {},
      google: {
        clientId: S.google?.clientId || '',
        accessToken: S.google?.accessToken || null,
        tokenExpiry: S.google?.tokenExpiry || 0,
        user: S.google?.user || null,
      },
      sbOpen: S.sbOpen,
    };
    SafeStorage.set(STORAGE_KEY, JSON.stringify(data));
  } catch(e) {
    console.warn('Atlas: persist failed', e);
  }
}

// [CHANGED] loadFromStorage — loads NON-SENSITIVE settings only. API keys loaded separately via KeyStore.
function loadFromStorage() {
  try {
    const raw = SafeStorage.get(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);

    // [REMOVED] API key loading — keys are loaded by initSecureStorage() via KeyStore
    // Safety: if someone manually put keys in localStorage, ignore them here

    if (data.provider) S.provider = data.provider;
    if (data.localBaseUrl) S.localBaseUrl = data.localBaseUrl;
    if (data.deepseekModels) S._deepseekModels = data.deepseekModels;
    if (data.geminiModels) S._geminiModels = data.geminiModels;
    if (data.openaiModels) S.openaiModels = data.openaiModels;

    if (data.cfg) {
      S.cfg = { ...S.cfg, ...data.cfg };
      // Explicitly restore smartPatch from top-level key (handles boolean false correctly)
      if ('smartPatch' in data) S.cfg.smartPatch = data.smartPatch;
      else if ('smartPatch' in data.cfg) S.cfg.smartPatch = data.cfg.smartPatch;
      const tsl = document.getElementById('sl-temp');
      const msl = document.getElementById('sl-maxtok');
      const psl = document.getElementById('sl-topp');
      const isl = document.getElementById('sl-img-size');
      const iml = document.getElementById('sl-img-model');
      if (tsl) { tsl.value = S.cfg.temp; document.getElementById('val-temp').textContent = S.cfg.temp.toFixed(2); }
      const gsp = document.getElementById('global-sysprompt-input');
      if (gsp && S.cfg.globalSysPrompt) gsp.value = S.cfg.globalSysPrompt;
      if (msl) { msl.value = S.cfg.maxTok; document.getElementById('val-maxtok').textContent = parseInt(S.cfg.maxTok).toLocaleString(); }
      if (psl) { psl.value = S.cfg.topP; document.getElementById('val-topp').textContent = S.cfg.topP.toFixed(2); }
      if (isl) isl.value = S.cfg.imgSize || '1024x1024';
      if (iml) iml.value = S.cfg.imgModel || '';
    }

    if (data.budget != null) S.budget = data.budget;
    if (data.totalCost != null) S.totalCost = data.totalCost;
    if (data.theme) { S.theme = data.theme; setTheme(data.theme); }
    if (data.imageGenMode != null) {
      S.imageGenMode = data.imageGenMode;
      if (S.imageGenMode) {
        document.getElementById('image-gen-btn').classList.add('active');
        document.getElementById('user-input').placeholder = 'Describe the image you want to generate…';
      }
    }
    if (data.webSearchMode) {
      S.webSearchMode = true;
      document.getElementById('web-search-btn').classList.add('active');
    }
    updateCostDisplay();

    if (data.sysprompt) {
      const spi = document.getElementById('sys-input');
      if (spi) spi.value = data.sysprompt;
    }

    // [CHANGED] chatId is loaded; conversations will be loaded from IndexedDB by initSecureStorage
    if (data.chatId) S.chatId = data.chatId;

    if (data.model) {
      S._pendingModel = data.model;
    }

    if (Array.isArray(data.favModels)) {
      S.favModels = data.favModels;
    }
    if (data.lastModelByProvider) {
      S._lastModelByProvider = data.lastModelByProvider;
    }

    if (data.google) {
      S.google = S.google || {};
      S.google.clientId = data.google.clientId || '';
      S.google.accessToken = data.google.accessToken || null;
      S.google.tokenExpiry = data.google.tokenExpiry || 0;
      S.google.user = data.google.user || null;
      if (S.google.accessToken && S.google.tokenExpiry > Date.now()) {
        S.google.scopes = GOOGLE_SCOPES;
      }
    }

    if (data.sbOpen === false) {
      S.sbOpen = false;
      document.getElementById('sidebar')?.classList.add('coll');
    }

    return true;
  } catch(e) {
    console.warn('Atlas: loadFromStorage failed', e);
    return false;
  }
}

// [CHANGED] clearStorage now just removes settings (keys cleared via clearAllDataConfirm)
function clearStorage() {
  SafeStorage.remove(STORAGE_KEY);
  toast('Settings cleared', 'ok');
}

// ── [ADDED] migrateFromLocalStorage ──────────────────────────────────────────
async function migrateFromLocalStorage() {
  let migrated = { convs: 0, keys: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { toast('Nothing to migrate', ''); return; }
    const data = JSON.parse(raw);

    // Migrate conversations to IndexedDB
    if (Array.isArray(data.convs) && data.convs.length) {
      for (const c of data.convs) {
        try { await ChatStorage.saveConversation(c); migrated.convs++; } catch(e) {}
      }
      // Load them into state
      const all = await ChatStorage.loadAllConversations();
      S.convs = all.sort((a, b) => parseInt(b.id) - parseInt(a.id));
      renderChatList();
    }

    // Migrate API keys — prompt user first
    const keysFound = [];
    if (data.key) keysFound.push({ provider: 'openrouter', key: data.key });
    if (data.deepseekKey) keysFound.push({ provider: 'deepseek', key: data.deepseekKey });
    if (data.geminiKey) keysFound.push({ provider: 'gemini', key: data.geminiKey });
    if (data.openaiKey) keysFound.push({ provider: 'openai', key: data.openaiKey });

    if (keysFound.length) {
      const ok = confirm(`Found ${keysFound.length} API key(s) in unsecured storage.\n\nMigrate to secure browser storage (Credential Manager)?`);
      if (ok) {
        for (const { provider, key } of keysFound) {
          await KeyStore.saveKey(provider, key, true);
          migrated.keys++;
          // Apply to state
          if (provider === 'openrouter') S.key = key;
          else if (provider === 'deepseek') S.deepseekKey = key;
          else if (provider === 'gemini') S.geminiKey = key;
          else if (provider === 'openai') S.openaiKey = key;
        }
        updateSecurityStatus('credential');
        updateKeyUI();
      }
    }

    // Remove old sensitive data from localStorage after successful migration
    const cleanData = { ...data };
    delete cleanData.key; delete cleanData.deepseekKey; delete cleanData.geminiKey; delete cleanData.openaiKey;
    delete cleanData.convs;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanData));

    // Hide the warning banner
    const warn = document.getElementById('insecure-storage-warning');
    if (warn) warn.style.display = 'none';

    toast(`Migration complete: ${migrated.convs} conversations, ${migrated.keys} key(s) secured`, 'ok');
  } catch(e) {
    toast('Migration failed: ' + e.message, 'er');
  }
}

// [ADDED] Helper: update key status indicator in sidebar
function updateKeyUI() {
  const dot = document.getElementById('key-dot');
  const txt = document.getElementById('key-text');
  if (!dot || !txt) return;
  const p = S.provider || 'openrouter';
  const key = p === 'deepseek' ? S.deepseekKey : p === 'gemini' ? S.geminiKey : p === 'openai' ? S.openaiKey : p === 'local' ? S.localBaseUrl : S.key;
  if (key) {
    dot.classList.remove('off');
    const prefix = p === 'openrouter' ? '' : (p.charAt(0).toUpperCase() + p.slice(1) + ': ');
    const display = p === 'local' ? key.replace(/^https?:\/\//, '').slice(0, 22) : key.slice(0, 18) + '…';
    txt.textContent = prefix + display;
  } else {
    dot.classList.add('off');
    txt.textContent = 'No key — click to add';
  }
}

// ── [ADDED] exportAllData — conversations only, NO API keys ──────────────────
async function exportAllData() {
  try {
    const convs = await ChatStorage.loadAllConversations();
    const data = {
      exported: new Date().toISOString(),
      appVersion: 'Atlas-13',
      // [SECURITY] API keys are NEVER included in exports
      conversations: convs,
      settings: (() => {
        const raw = SafeStorage.get(STORAGE_KEY);
        if (!raw) return {};
        const d = JSON.parse(raw);
        // Strip any sensitive fields that might be there
        const { key, deepseekKey, geminiKey, openaiKey, localKey, ...safe } = d;
        return safe;
      })(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'atlas-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported — API keys were NOT included for security', 'ok');
  } catch(e) { toast('Export failed: ' + e.message, 'er'); }
}

// ── [ADDED] importAllData — with preview and merge logic ─────────────────────
async function importAllData(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const r = new FileReader();
  r.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      // Validate — accept both export envelope and bare array
      const incoming = Array.isArray(data) ? data
        : Array.isArray(data.conversations) ? data.conversations
        : null;
      if (!incoming) { toast('Invalid file — no conversations found', 'er'); return; }

      // Security: reject files that suspiciously contain API keys
      if (data.key || data.deepseekKey || data.geminiKey || data.openaiKey) {
        toast('⚠ Import file contains API keys — they will be ignored for security', '');
      }

      const existingIds = new Set(S.convs.map(c => c.id));
      const fresh = incoming.filter(c => c && c.id && !existingIds.has(c.id));
      if (!fresh.length) { toast('No new conversations to import', ''); return; }

      const confirmed = confirm(`Import ${fresh.length} conversation(s)?\n\nThey will be merged with your existing history.`);
      if (!confirmed) return;

      // Save to IndexedDB
      for (const c of fresh) {
        try { await ChatStorage.saveConversation(c); } catch(e) {}
      }
      S.convs = [...fresh, ...S.convs];
      renderChatList();
      persist();
      toast(`Imported ${fresh.length} conversation${fresh.length !== 1 ? 's' : ''} ✓`, 'ok');
    } catch(err) {
      toast('Import failed: ' + err.message, 'er');
    }
  };
  r.onerror = () => toast('Could not read file', 'er');
  r.readAsText(file);
}

// ── [ADDED] clearAllDataConfirm — clears everything including session keys ───
async function clearAllDataConfirm() {
  const ok = confirm('Clear ALL data?\n\n• All conversations (from IndexedDB)\n• All settings\n• All stored API keys\n\nThis cannot be undone.');
  if (!ok) return;
  try {
    await ChatStorage.clearAll();
    await KeyStore.clearKeys();
    SafeStorage.remove(STORAGE_KEY);
    // Clear skills
    try { localStorage.removeItem('atlas_skills_v1'); } catch(e) {}
    try { localStorage.removeItem('atlas_skill_overrides_v1'); } catch(e) {}
    // Reset state
    S.key = ''; S.deepseekKey = ''; S.geminiKey = ''; S.openaiKey = ''; S.localKey = ''; S.localBaseUrl = 'http://localhost:11434';
    S.convs = []; S.msgs = []; S.chatId = null;
    renderChatList(); renderMessages();
    updateSecurityStatus('none');
    updateKeyUI();
    closeSettings();
    toast('All data cleared', 'ok');
  } catch(e) { toast('Clear failed: ' + e.message, 'er'); }
}

// ── [ADDED] Key persistence button handlers ──────────────────────────────────
async function saveCurrentKeySessionOnly() {
  const result = await KeyStore.saveCurrentKey(false);
  if (result) { updateSecurityStatus('session'); toast('Key saved for this session only ⏱', 'ok'); }
  else toast('No active key to save', 'er');
}

async function saveCurrentKeyToBrowser() {
  if (!window.PasswordCredential) {
    toast('Credential API not available in this browser — using session storage', '');
    await saveCurrentKeySessionOnly();
    return;
  }
  const result = await KeyStore.saveCurrentKey(true);
  if (result === 'credential') { updateSecurityStatus('credential'); toast('🔒 Key saved in browser password manager', 'ok'); }
  else if (result === 'session') { updateSecurityStatus('session'); toast('Saved to session (Credential API unavailable)', ''); }
  else toast('No active key to save', 'er');
}

// ── [ADDED] Update storage info in settings modal ────────────────────────────
async function updateStorageInfo() {
  const est = await ChatStorage.getStorageEstimate();
  const sizeEl = document.getElementById('storage-size');
  const barEl = document.getElementById('storage-usage-bar');
  const countEl = document.getElementById('storage-conv-count');
  const quotaEl = document.getElementById('storage-quota-label');

  if (est.usage > 0 || est.quota > 0) {
    const usageMB = (est.usage / 1048576).toFixed(2);
    const quotaMB = est.quota ? (est.quota / 1048576 / 1024).toFixed(1) + ' GB' : '?';
    if (sizeEl) sizeEl.textContent = usageMB + ' MB used';
    if (barEl && est.quota) barEl.style.width = Math.min(100, (est.usage / est.quota * 100)).toFixed(1) + '%';
    if (quotaEl) quotaEl.textContent = 'of ' + quotaMB;
  } else {
    if (sizeEl) sizeEl.textContent = 'IndexedDB';
  }

  if (countEl) countEl.textContent = S.convs.length + ' conversation' + (S.convs.length !== 1 ? 's' : '');
  updateSecurityStatus(_currentKeySource);
}

// ── [ADDED] Master init function — runs on page load ──────────────────────────
async function initSecureStorage() {
  // 1. Initialize IndexedDB
  try {
    await ChatStorage.init();
  } catch(e) {
    console.warn('Atlas: IndexedDB init failed, conversations may not persist', e);
  }

  // 2. Load non-sensitive settings from localStorage
  loadFromStorage();

  // 3. Try to load API keys securely
  let keySource = 'none';
  try {
    const { keys, source } = await KeyStore.loadKeys();
    keySource = source;
    if (keys.openrouter) S.key = keys.openrouter;
    if (keys.deepseek)   S.deepseekKey = keys.deepseek;
    if (keys.gemini)     S.geminiKey = keys.gemini;
    if (keys.openai)     S.openaiKey = keys.openai;
    if (keys.local) {
      try {
        const lc = JSON.parse(keys.local);
        if (lc.baseUrl) S.localBaseUrl = lc.baseUrl;
        if (lc.key)     S.localKey = lc.key;
      } catch(e) { /* old string format — ignore */ }
    }
  } catch(e) {
    console.warn('Atlas: key load failed', e);
  }

  // 4. Load conversations from IndexedDB
  try {
    const all = await ChatStorage.loadAllConversations();
    if (all.length) {
      S.convs = all.sort((a, b) => parseInt(b.id) - parseInt(a.id));
      const active = S.convs.find(c => c.id === S.chatId) || S.convs[0];
      if (active) {
        S.chatId = active.id;
        S.msgs = active.msgs || [];
        if (Array.isArray(active.codeStore) && active.codeStore.length) {
          S.codeStore = new Map(active.codeStore);
        }
      }
      renderChatList();
      if (S.msgs.length) renderMessages();
    }
  } catch(e) {
    console.warn('Atlas: IndexedDB load failed', e);
  }

  // 5. If no conversations in IndexedDB, try migrating from localStorage
  if (!S.convs.length) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.convs) && data.convs.length) {
          console.log('Atlas: migrating conversations from localStorage to IndexedDB');
          for (const c of data.convs) {
            try { await ChatStorage.saveConversation(c); } catch(e) {}
          }
          S.convs = data.convs;
          const active = S.convs.find(c => c.id === S.chatId) || S.convs[0];
          if (active) {
            S.chatId = active.id;
            S.msgs = active.msgs || [];
            if (Array.isArray(active.codeStore) && active.codeStore.length) {
              S.codeStore = new Map(active.codeStore);
            }
          }
          renderChatList();
          if (S.msgs.length) renderMessages();
          toast('Conversations migrated to IndexedDB', 'ok');
        }
      }
    } catch(e) { /* silent */ }
  }

  // 6. Check for insecure keys in localStorage and warn user
  // Always re-render the sidebar after all conversation data is loaded
  renderChatList();
  if (S.msgs.length) renderMessages();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.key || data.deepseekKey || data.geminiKey || data.openaiKey) {
        // Also restore keys if we didn't get them from secure storage
        if (!S.key && data.key) { S.key = data.key; keySource = 'session'; }
        if (!S.deepseekKey && data.deepseekKey) { S.deepseekKey = data.deepseekKey; keySource = 'session'; }
        if (!S.geminiKey && data.geminiKey) { S.geminiKey = data.geminiKey; keySource = 'session'; }
        if (!S.openaiKey && data.openaiKey) { S.openaiKey = data.openaiKey; keySource = 'session'; }
        if (!S.localBaseUrl && data.localBaseUrl) { S.localBaseUrl = data.localBaseUrl; }
        const warn = document.getElementById('insecure-storage-warning');
        if (warn) warn.style.display = '';
      }
    }
  } catch(e) {}

  // 7. Update key UI
  updateKeyUI();
  updateSecurityStatus(keySource);

  // 8. If no key available at all, show the key modal
  const hasKey = S.key || S.deepseekKey || S.geminiKey || S.openaiKey || S.localBaseUrl;
  if (!hasKey) {
    setTimeout(openKeyModal, 600);
  } else {
    setTimeout(reloadModels, 100);
  }
}

async function reloadModels() {
  if (S.provider === 'deepseek') {
    if (!S.deepseekKey) return;
    // Re-fetch live model list on session restore
    try {
      const res = await fetch('https://api.deepseek.com/models', {
        headers: { 'Authorization': 'Bearer ' + S.deepseekKey }
      });
      if (res.ok) {
        const data = await res.json();
        const HIDE = new Set(['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder']);
        const liveModels = (data.data || [])
          .filter(m => !HIDE.has(m.id))
          .map(m => ({
            id: m.id, apiId: m.id,
            name: DEEPSEEK_NAME_MAP[m.id] || m.id,
            context_length: 1048576,
            pricing: DEEPSEEK_MODELS_FALLBACK.find(f => f.id === m.id)?.pricing
                     || { prompt: String(0.14 / 1e6), completion: String(0.28 / 1e6) },
            description: DEEPSEEK_MODELS_FALLBACK.find(f => f.id === m.id)?.description || '',
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        if (liveModels.length) S._deepseekModels = liveModels;
      }
    } catch(e) { /* use cached fallback */ }
    loadDeepSeekModels();
    toast('Session restored ✓', 'ok');
    return;
  }
  if (S.provider === 'openai') {
    if (!S.openaiKey) return;
    loadOpenAIModels();
    toast('Session restored ✓', 'ok');
    return;
  }
  if (S.provider === 'local') {
    if (!S.localBaseUrl) return;
    loadLocalModels().then(() => toast('Session restored ✓', 'ok')).catch(() => {});
    return;
  }
  if (S.provider === 'gemini') {
    if (!S.geminiKey) return;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(S.geminiKey)}&pageSize=50`);
      if (res.ok) {
        const data = await res.json();
        const liveModels = (data.models || [])
          .filter(m => (m.supportedGenerationMethods || []).includes('generateContent')
                   && !m.name.includes('embedding') && !m.name.includes('aqa'))
          .map(m => {
            const id = m.name.replace('models/', '');
            const fallback = GEMINI_MODELS_FALLBACK.find(f => f.id === id);
            return {
              id, apiId: id,
              name: m.displayName || id,
              context_length: m.inputTokenLimit || 1048576,
              pricing: fallback?.pricing || { prompt: String(0.075 / 1e6), completion: String(0.30 / 1e6) },
              description: m.description || fallback?.description || '',
              architecture: { modality: 'text+image->text' },
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        if (liveModels.length) S._geminiModels = liveModels;
      }
    } catch(e) { /* use cached fallback */ }
    loadGeminiModels();
    toast('Session restored ✓', 'ok');
    return;
  }
  if (!S.key) return;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': 'Bearer ' + S.key }
    });
    if (!res.ok) {
      if (res.status === 402) {
        // Insufficient balance — key is still valid, free models remain accessible
        toast('⚠ OpenRouter: insufficient balance — free models still available', '');
        // Still try to parse models if the response has a body
        try {
          const data = await res.json();
          if (data.data && data.data.length) {
            S.allModels = (data.data || [])
              .filter(m => {
                if (m.id.startsWith('openrouter/')) return false;
                if (!m.context_length || m.context_length <= 0) return false;
                return m.top_provider != null || parseFloat(m.pricing?.prompt || '-1') >= 0;
              })
              .sort((a, b) => a.name.localeCompare(b.name));
            S.filtModels = [...S.allModels];
            renderModelList();
            updateImageModelDropdown();
          }
        } catch(e) {}
        document.getElementById('send-btn').disabled = false;
        return;
      }
      S.key = '';
      document.getElementById('key-dot').classList.add('off');
      document.getElementById('key-text').textContent = 'Key expired — click to reconnect';
      openKeyModal();
      return;
    }
    const data = await res.json();
    S.allModels = (data.data || [])
      .filter(m => {
        if (m.id.startsWith('openrouter/')) return false;
        if (!m.context_length || m.context_length <= 0) return false;
        return m.top_provider != null || parseFloat(m.pricing?.prompt || '-1') >= 0;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    S._orModels = [...S.allModels]; // keep in sync so switchProvider can restore it
    S.filtModels = [...S.allModels];
    renderModelList();
    updateImageModelDropdown();

    if (S._pendingModel) {
      const m = S.allModels.find(x => x.id === S._pendingModel.id) || S._pendingModel;
      m.apiId = m.id.replace(/:(free|nitro|floor|beta)$/, '');
      S.model = m;
      document.getElementById('m-icon').textContent = modelIcon(m.id);
      document.getElementById('m-name').textContent = m.name;
      const ip = parseFloat(m.pricing?.prompt || 0);
      const op = parseFloat(m.pricing?.completion || 0);
      document.getElementById('m-price').textContent = S.provider === 'gemini'
        ? 'Free (Google quota)'
        : (ip === 0 && op === 0) ? 'Free' : '$' + (ip*1e6).toFixed(2) + '/$' + (op*1e6).toFixed(2) + '/M';
      S._pendingModel = null;
    }
    document.getElementById('send-btn').disabled = false;
    toast('Session restored ✓', 'ok');
  } catch(e) {
    console.warn('reloadModels failed', e);
  }
}

function getStorageSize() {
  try {
    const raw = SafeStorage.get(STORAGE_KEY);
    if (!raw) return '0 KB';
    const bytes = new Blob([raw]).size;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/1048576).toFixed(2) + ' MB';
  } catch(e) { return '?'; }
}

function openSettings() {
  document.getElementById('budget-input').value = S.budget || '';
  document.getElementById('modal-cost').textContent = '$' + S.totalCost.toFixed(4);
  // [CHANGED] Storage info now loaded from IndexedDB
  updateStorageInfo();
  const dontsEl = document.getElementById('donts-input');
  if (dontsEl) dontsEl.value = S.cfg.donts || '';
  const fontEl = document.getElementById('sl-font');
  if (fontEl) fontEl.value = S.cfg.font || 'DM Sans';
  const fsEl = document.getElementById('sl-fontsize');
  if (fsEl) { fsEl.value = S.cfg.fontSize || 14; document.getElementById('val-fontsize').textContent = (S.cfg.fontSize || 14) + 'px'; }
  // Snapshot so Cancel can restore live preview changes
  _settingsOrigFont = S.cfg.font || 'DM Sans';
  _settingsOrigFontSize = S.cfg.fontSize || 14;
  const densEl = document.getElementById('sl-density');
  const densLabels = ['Compact','Normal','Spacious'];
  if (densEl) { const dv = S.cfg.chatDensity != null ? S.cfg.chatDensity : 1; densEl.value = dv; document.getElementById('val-density').textContent = densLabels[dv] || 'Normal'; }
  const spEl = document.getElementById('toggle-smart-patch');
  if (spEl) spEl.checked = S.cfg.smartPatch !== false; // default true
  
  // Initialize skill settings in modal
  const skillToggle = document.getElementById('skill-auto-toggle');
  if (skillToggle) skillToggle.checked = S.skills.smartAuto === true;
  updateSkillPill();
  
  // Show overlay and settings modal
  const overlay = document.querySelector('.modal-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.classList.add('open');
  }
  const settingsModal = document.getElementById('settings-modal');
  if (settingsModal) {
    settingsModal.style.display = 'block';
    settingsModal.classList.add('open');
  }
  
  const gfn = document.getElementById('gemini-free-note');
  if (gfn) gfn.style.display = 'none'; // removed per design
  const gctr = document.getElementById('gemini-cost-track-row');
  if (gctr) gctr.style.display = (S.provider === 'gemini') ? 'block' : 'none';
  const gcToggle = document.getElementById('toggle-gemini-cost');
  if (gcToggle) gcToggle.checked = !!S.cfg.geminiTrackCost;
  const tierLabel = document.getElementById('gemini-tier-label');
  if (tierLabel) {
    if (S._geminiIsPaid === true) tierLabel.textContent = '✓ Paid (cost tracking on)';
    else if (S._geminiIsPaid === false) tierLabel.textContent = '☁ Free tier';
    else tierLabel.textContent = 'Detecting…';
  }
}

// [REMOVED] exportMemory and importMemory replaced by exportAllData / importAllData (secure versions)

// ── EDIT & REGENERATE ─────────────────────────────────────────────────────
function copyMsgText(idx) {
  const m = S.msgs[idx];
  if (!m) return;
  navigator.clipboard.writeText(m.content).then(() => toast('Copied', 'ok'));
}

function editMsg(idx) {
  const m = S.msgs[idx];
  if (!m || m.role !== 'user') return;
  const bubble = document.getElementById('bubble-' + idx);
  if (!bubble) return;
  bubble.contentEditable = 'true';
  bubble.classList.add('editing');
  // Use setTimeout to ensure browser processes contentEditable change before focusing
  setTimeout(() => {
    bubble.focus();
    // Place cursor at end
    try {
      const range = document.createRange();
      range.selectNodeContents(bubble);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch(e) {}
  }, 0);
  const row = bubble.closest('.msg-row');
  const actionsEl = row?.querySelector('.msg-actions');
  if (actionsEl) {
    actionsEl.innerHTML = `
      <button class="ma-btn edit-confirm" onclick="confirmEdit(${idx})">✓ Send</button>
      <button class="ma-btn" onclick="cancelEdit(${idx})">✕ Cancel</button>`;
  }
}

function cancelEdit(idx) {
  renderMessages();
}

async function confirmEdit(idx) {
  const bubble = document.getElementById('bubble-' + idx);
  if (!bubble) return;
  const newText = bubble.innerText.trim();
  if (!newText) return;
  bubble.contentEditable = 'false';
  bubble.classList.remove('editing');
  S.msgs = S.msgs.slice(0, idx);
  const chat = S.convs.find(c => c.id === S.chatId);
  if (chat) chat.msgs = S.msgs;
  renderMessages();
  document.getElementById('user-input').value = newText;
  await sendMessage();
}

async function deleteMsg(idx) {
  if (!confirm('Delete this message?')) return;
  S.msgs.splice(idx, 1);
  const chat = S.convs.find(c => c.id === S.chatId);
  if (chat) chat.msgs = S.msgs;
  persist();
  renderMessages();
  toast('Message deleted', 'ok');
}

async function deleteAndResend(idx) {
  // Delete this user message and everything after, then resend immediately
  const msg = S.msgs[idx];
  if (!msg || msg.role !== 'user') return;
  const txt = typeof msg.content === 'string' ? msg.content : '';
  S.msgs.splice(idx);
  const chat = S.convs.find(c => c.id === S.chatId);
  if (chat) chat.msgs = S.msgs;
  persist();
  renderMessages();
  // Put text in input and send immediately
  const inp = document.getElementById('user-input');
  inp.value = txt;
  autoResize(inp);
  await sendMessage();
}

async function regenMsg(idx) {
  const m = S.msgs[idx];
  if (!m || m.role !== 'assistant') return;
  S.msgs = S.msgs.slice(0, idx);
  const chat = S.convs.find(c => c.id === S.chatId);
  if (chat) chat.msgs = S.msgs;
  renderMessages();
  await sendFromHistory();
}

async function sendFromHistory() {
  const activeKey2 = S.provider === 'deepseek' ? S.deepseekKey : S.provider === 'gemini' ? S.geminiKey : S.provider === 'openai' ? S.openaiKey : S.provider === 'local' ? (S.localKey || 'local') : S.key;
  if (!activeKey2) { openKeyModal(); return; }
  if (!S.model) { toast('Select a model first', 'er'); return; }
  if (S.budget > 0 && S.totalCost >= S.budget) { toast('Budget cap reached', 'er'); return; }

  const ca = document.getElementById('chat-area');
  const thinkRow = document.createElement('div');
  thinkRow.className = 'msg-row ai';
  const _thinkId2 = 'think-label-' + Date.now();
  thinkRow.innerHTML = `<div class="avatar aav" style="animation:atlasPulse 1.8s ease-in-out infinite">✦</div><div class="msg-body"><div class="msg-bubble" style="background:transparent;padding:6px 0"><div class="thinking-row"><div class="t-dots"><span></span><span></span><span></span></div><span class="thinking-label" id="${_thinkId2}">Thinking…</span></div></div></div>`;
  const _thinkPhrases2 = ['Thinking…','Analyzing…','Reasoning…','Working on it…','Almost there…'];
  let _thinkIdx2 = 0;
  const _thinkTimer2 = setInterval(() => {
    _thinkIdx2 = (_thinkIdx2 + 1) % _thinkPhrases2.length;
    const lbl2 = document.getElementById(_thinkId2);
    if (lbl2) lbl2.textContent = _thinkPhrases2[_thinkIdx2];
    else clearInterval(_thinkTimer2);
  }, 2000);
  thinkRow._thinkTimer = _thinkTimer2;
  ca.appendChild(thinkRow); scrollBottom();

  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = false;
  sendBtn.classList.add('stop');
  sendBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="2" y="2" width="7" height="7" rx="1" fill="currentColor"/></svg>`;
  S.streaming = true; S.ac = new AbortController();

  const apiMsgs = buildApiMsgs();
  const sp = document.getElementById('sys-input').value.trim();
  if (sp) apiMsgs.unshift({ role: 'system', content: sp });

  const safeReferer = location.href.startsWith('http') ? location.href : 'https://nexus-or.local';

  // ── GEMINI BRANCH ──
  if (S.provider === 'gemini') {
    const aiMsg = { role: 'assistant', content: '', iTok: 0, oTok: 0, cost: 0 };
    S.msgs.push(aiMsg);
    const aiIdx = S.msgs.length - 1;
    const chat = S.convs.find(c => c.id === S.chatId);

    const sid = 'sc' + Date.now();
    const aiRow = document.createElement('div');
    aiRow.className = 'msg-row ai';
    aiRow.innerHTML = `<div class="avatar aav">✦</div><div class="msg-body"><div class="msg-bubble"><div class="md-body" id="${sid}"></div></div><div class="msg-meta" id="sm${Date.now()}"></div></div>`;

    // Build Gemini contents array
    const geminiContents2 = [];
    const systemParts2 = [];
    for (const m of apiMsgs) {
      if (m.role === 'system') { systemParts2.push({ text: m.content }); continue; }
      const role = m.role === 'assistant' ? 'model' : 'user';
      const parts = [];
      if (typeof m.content === 'string') parts.push({ text: m.content });
      else if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part.type === 'text') parts.push({ text: part.text });
          else if (part.type === 'image_url') {
            const url = part.image_url?.url || '';
            if (url.startsWith('data:')) {
              const [meta, b64] = url.split(',');
              const mimeType = meta.split(':')[1].split(';')[0];
              parts.push({ inlineData: { mimeType, data: b64 } });
            }
          }
        }
      }
      if (parts.length) geminiContents2.push({ role, parts });
    }
    const geminiBody2 = {
      contents: geminiContents2,
      generationConfig: { temperature: S.cfg.temp, maxOutputTokens: S.cfg.maxTok, topP: S.cfg.topP },
    };
    if (systemParts2.length) geminiBody2.systemInstruction = { parts: systemParts2 };

    const modelId2 = (S.model.apiId || S.model.id);
    const geminiEndpoint2 = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId2)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(S.geminiKey)}`;

    try {
      const res2 = await fetch(geminiEndpoint2, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody2), signal: S.ac.signal,
      });
      if (!res2.ok) {
        let em = 'HTTP ' + res2.status;
        try { const ed = await res2.json(); em = ed?.error?.message || em; } catch {}
        throw new Error(em);
      }
      if (thinkRow._thinkTimer) clearInterval(thinkRow._thinkTimer);
      thinkRow.remove();
      ca.appendChild(aiRow); scrollBottom();
      const sEl2 = document.getElementById(sid);
      const reader2 = res2.body.getReader(); const decoder2 = new TextDecoder(); let buf2 = '', full2 = '';
      while (true) {
        const { done, value } = await reader2.read(); if (done) break;
        buf2 += decoder2.decode(value, { stream: true });
        const lines2 = buf2.split('\n'); buf2 = lines2.pop();
        for (const line of lines2) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === '[DONE]') continue;
          let chunk2; try { chunk2 = JSON.parse(payload); } catch { continue; }
          const parts2 = chunk2.candidates?.[0]?.content?.parts || [];
          const td = parts2.filter(p => typeof p.text === 'string').map(p => p.text).join('');
          if (td) { full2 += td; if (sEl2) sEl2.innerHTML = renderMarkdown(full2, aiIdx); scrollBottom(); }
          if (chunk2.usageMetadata) {
            aiMsg.iTok = chunk2.usageMetadata.promptTokenCount || 0;
            aiMsg.oTok = chunk2.usageMetadata.candidatesTokenCount || 0;
            aiMsg.cost = calcCost(aiMsg.iTok, aiMsg.oTok);
            S.totalCost += aiMsg.cost; updateCostDisplay();
          }
        }
      }
      aiMsg.content = full2;
      S.msgs[aiIdx] = aiMsg;
      if (chat) chat.msgs = S.msgs;
      persist(); updateCtxBar(); renderMessages();
    } catch(e) {
      if (thinkRow.parentNode) thinkRow.remove();
      if (e.name !== 'AbortError') {
        const er = document.createElement('div');
        er.className = 'msg-row ai';
        er.innerHTML = `<div class="avatar aav">✦</div><div class="msg-body"><div class="msg-bubble" style="color:var(--red)"><strong>Error:</strong> ${esc(e.message)}</div></div>`;
        ca.appendChild(er); scrollBottom(); toast(e.message, 'er');
      }
    } finally {
      S.streaming = false;
      sendBtn.classList.remove('stop');
      sendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5h10M6.5 1.5l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
    return;
  }

  // sendFromHistory is for regeneration — no edit intent, use normal settings
  const patchMode = false;
  const requestBody = {
    model: (S.model.apiId || S.model.id).replace(/:(free|nitro|floor|beta)$/, ''),
    messages: apiMsgs,
    stream: true,
    temperature: patchMode ? 0.2 : S.cfg.temp,
    max_tokens: patchMode ? 4096 : S.cfg.maxTok,
    top_p: S.cfg.topP,
  };
  if (hasToolUse(S.model) && S.provider !== 'deepseek') {
    requestBody.tools = S.toolDefinitions;
    requestBody.tool_choice = 'auto';
  }

  // ── DEEPSEEK / OPENROUTER / LOCAL BRANCH ──
  const isDeepSeek2 = S.provider === 'deepseek';
  const isOpenAI2   = S.provider === 'openai';
  const isLocal2    = S.provider === 'local';
  const fetchUrl2 = isDeepSeek2
    ? 'https://api.deepseek.com/v1/chat/completions'
    : isOpenAI2
    ? 'https://api.openai.com/v1/chat/completions'
    : isLocal2
    ? (S.localBaseUrl || 'http://localhost:11434').replace(/\/+$/, '') + '/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';
  const fetchHeaders2 = isDeepSeek2
    ? { 'Authorization': `Bearer ${S.deepseekKey}`, 'Content-Type': 'application/json' }
    : isOpenAI2
    ? { 'Authorization': `Bearer ${S.openaiKey}`, 'Content-Type': 'application/json' }
    : isLocal2
    ? { 'Authorization': `Bearer ${S.localKey || 'none'}`, 'Content-Type': 'application/json' }
    : { 'Authorization': `Bearer ${S.key}`, 'Content-Type': 'application/json', 'HTTP-Referer': safeReferer, 'X-Title': 'Atlas' };

  try {
    const res = await fetch(fetchUrl2, {
      method: 'POST',
      headers: fetchHeaders2,
      body: JSON.stringify(requestBody),
      signal: S.ac.signal,
    });

    if (!res.ok) {
      let em = 'HTTP ' + res.status;
      try { const ed = await res.json(); em = ed?.error?.message || em; if (em.toLowerCase().includes('no allowed providers')) showAccountError(); } catch {}
      throw new Error(em);
    }

    if (thinkRow._thinkTimer) clearInterval(thinkRow._thinkTimer);
  thinkRow.remove();
    const aiMsg = { role: 'assistant', content: '', iTok: 0, oTok: 0, cost: 0, toolCalls: [], toolResults: {} };
    S.msgs.push(aiMsg);
    const aiIdx = S.msgs.length - 1;
    const chat = S.convs.find(c => c.id === S.chatId);

    const aiRow = document.createElement('div');
    aiRow.className = 'msg-row ai';
    const sid = 'sc' + Date.now();
    aiRow.innerHTML = `<div class="avatar aav">✦</div><div class="msg-body"><div class="msg-bubble"><div class="md-body" id="${sid}"></div></div><div class="msg-meta" id="sm${Date.now()}"></div></div>`;
    ca.appendChild(aiRow); scrollBottom();

    const sEl = document.getElementById(sid);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', full = '';
    const toolCallBuffer = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        let chunk; try { chunk = JSON.parse(payload); } catch { continue; }
        if (chunk.error) { if ((chunk.error?.message||'').toLowerCase().includes('no allowed providers')) showAccountError(); throw new Error(chunk.error?.message || 'Stream error'); }
        
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.tool_calls) {
          delta.tool_calls.forEach(tc => {
            const idx = tc.index || 0;
            if (!toolCallBuffer[idx]) toolCallBuffer[idx] = { id: '', function: { name: '', arguments: '' } };
            if (tc.id) toolCallBuffer[idx].id = tc.id;
            if (tc.function?.name) toolCallBuffer[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCallBuffer[idx].function.arguments += tc.function.arguments;
          });
        }
        
        full += delta?.content || '';
        if (sEl) sEl.innerHTML = renderMarkdown(full, S.msgs.length - 1);
        scrollBottom();
        if (chunk.usage) {
          aiMsg.iTok = chunk.usage.prompt_tokens || 0;
          aiMsg.oTok = chunk.usage.completion_tokens || 0;
          aiMsg.cost = calcCost(aiMsg.iTok, aiMsg.oTok);
          S.totalCost += aiMsg.cost; updateCostDisplay();
        }
      }
    }
    
    // Process tool calls
    if (Object.keys(toolCallBuffer).length > 0) {
      const toolCalls = Object.values(toolCallBuffer).filter(tc => tc.function?.name);
      aiMsg.toolCalls = toolCalls;
      for (const tc of toolCalls) {
        try {
          aiMsg.toolResults[tc.id] = await executeToolCall(tc);
        } catch(e) {
          aiMsg.toolResults[tc.id] = { error: e.message };
        }
      }
    }
    
    aiMsg.content = full;
    S.msgs[aiIdx] = aiMsg;
    if (chat) chat.msgs = S.msgs;
    persist();
    updateCtxBar();
    renderMessages();
  } catch(e) {
    if (thinkRow.parentNode) thinkRow.remove();
    if (e.name !== 'AbortError') {
      const er = document.createElement('div');
      er.className = 'msg-row ai';
      er.innerHTML = `<div class="avatar aav">✦</div><div class="msg-body"><div class="msg-bubble" style="color:var(--red)"><strong>Error:</strong> ${esc(e.message)}</div></div>`;
      ca.appendChild(er); scrollBottom(); toast(e.message, 'er');
    }
  } finally {
    S.streaming = false;
    sendBtn.classList.remove('stop');
    sendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5h10M6.5 1.5l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
}

// ── MESSAGE BUILDING ──────────────────────────────────────────────────────
// Max history messages to send per request — keeps token counts low on free tiers
const MAX_HISTORY_MSGS = 20;

function buildApiMsgs() {
  // For Gemini free tier, cap history to last N messages to reduce token usage
  const msgs = S.provider === 'gemini' && S.msgs.length > MAX_HISTORY_MSGS
    ? S.msgs.slice(-MAX_HISTORY_MSGS)
    : S.msgs;
  return msgs.map(m => {
    if (m.role === 'assistant') {
      // Strip large code blocks from history — they're already in codeStore and will
      // be re-injected if needed. This prevents the same file being sent twice.
      let content = m.content || '';
      if (content.length > 3000) {
        // Strip large fenced code blocks
        content = content.replace(/```[\w]*\n[\s\S]{1500,}?```/g, (match) => {
          const lang = (match.match(/```([\w]*)/) || [])[1] || 'code';
          const lines = match.split('\n').length;
          return '```' + lang + '\n[' + lines + '-line block — see codeStore]\n```';
        });
        // Also strip unfenced HTML/large content (model sometimes outputs raw HTML)
        if (content.length > 8000) {
          content = content.slice(0, 300) + '\n[... large content truncated — see codeStore ...]\n' + content.slice(-100);
        }
      }
      const msg = { role: 'assistant', content };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments }
        }));
      }
      return msg;
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    }
    if (m.files?.length) {
      const content = [];
      m.files.forEach(f => {
        if (f.type.startsWith('image/')) {
          const mt = f.type === 'image/jpg' ? 'image/jpeg' : f.type;
          content.push({ type: 'image_url', image_url: { url: `data:${mt};base64,${f.data}` } });
        } else {
          content.push({ type: 'text', text: `[File: ${f.name}]\n${f.data}` });
        }
      });
      if (m.content) content.push({ type: 'text', text: m.content });
      return { role: 'user', content };
    }
    return { role: 'user', content: m.content };
  });
}

// ── ARTIFACT PANEL ────────────────────────────────────────────────────────
const _artifacts = [];
let _activeArt = 0;

function previewCode(id) {
  const blk = document.getElementById(id);
  if (!blk) return;
  const raw = blk.dataset.raw ? decodeURIComponent(escape(atob(blk.dataset.raw))) : blk.querySelector('pre')?.innerText || '';
  const lang = (blk.dataset.lang || 'html').toLowerCase();
  // Build title: prefer <title> tag, then filename comment, then fallback
  const titleFromTag = raw.match(/<title>([^<]+)<\/title>/i)?.[1];
  const titleFromComment = raw.split('\n').slice(0, 5).reduce((found, line) => {
    if (found) return found;
    const m = line.match(/filename[:\s]+([\w\-. ]+\.\w+)/i) || line.match(/^[#\/\*]+\s*([\w\-]+\.\w+)\s*$/);
    return m ? m[1].trim() : null;
  }, null);
  const derivedTitle = lang.toUpperCase() + ' — ' + (titleFromTag || titleFromComment || id);
  const existing = _artifacts.findIndex(a => a.id === id);
  if (existing >= 0) {
    // Update code and title on rewrites so filename persists
    _artifacts[existing].code = raw;
    _artifacts[existing].lang = lang;
    _artifacts[existing].title = derivedTitle;
    activateArtifact(existing);
    return;
  }
  _artifacts.push({ id, lang, code: raw, title: derivedTitle });
  activateArtifact(_artifacts.length - 1);
}

function activateArtifact(i) {
  _activeArt = i;
  _updateArtDriveBtn();
  // Clear any stale Drive link from a previous artifact
  const staleLink = document.getElementById('art-drive-link');
  if (staleLink) staleLink.remove();
  const art = _artifacts[i];
  if (!art) return;
  document.getElementById('artifact-title').textContent = art.title;
  renderArtTabs();
  loadArtFrame(art);
  document.getElementById('artifact-panel').classList.add('open');
  document.getElementById('app').classList.add('art-open');
  if (window.innerWidth <= 600) document.getElementById('main').classList.add('art-open');
  // Re-render Drive link if this artifact was previously uploaded
  if (art.driveLink) {
    const artHdr = document.getElementById('artifact-hdr');
    if (artHdr) {
      const freshLink = document.createElement('a');
      freshLink.id = 'art-drive-link';
      freshLink.href = art.driveLink;
      freshLink.target = '_blank';
      freshLink.rel = 'noopener noreferrer';
      freshLink.textContent = '☁ View in Drive →';
      freshLink.style.cssText = 'font-size:11px;color:var(--acc);text-decoration:none;padding:3px 8px;background:var(--agl);border-radius:4px;border:1px solid var(--acc2);display:inline-flex;align-items:center;white-space:nowrap;flex-shrink:0';
      const closeBtn = artHdr.querySelector('.art-btn.close');
      if (closeBtn) artHdr.insertBefore(freshLink, closeBtn);
      else artHdr.appendChild(freshLink);
    }
  }
}

function renderArtTabs() {
  const tabs = document.getElementById('artifact-tabs');
  tabs.innerHTML = _artifacts.map((a, i) =>
    `<div class="art-tab ${i === _activeArt ? 'active' : ''}" onclick="activateArtifact(${i})">${a.lang.toUpperCase()} ${i+1}<span class="art-tab-close" onclick="event.stopPropagation();closeArtTab(${i})">✕</span></div>`
  ).join('');
}

function closeArtTab(i) {
  _artifacts.splice(i, 1);
  if (_artifacts.length === 0) {
    closeArtifact(); return;
  }
  _activeArt = Math.min(_activeArt, _artifacts.length - 1);
  renderArtTabs();
  activateArtifact(_activeArt);
}

// BroadcastChannel id for current artifact tab session
let _consoleChannelId = null;


function loadArtFrame(art) {
  const frame = document.getElementById('artifact-frame');
  const src = document.getElementById('artifact-source');
  const wrap = document.getElementById('artifact-frame-wrap');
  wrap.classList.remove('src-mode');
  document.getElementById('art-view-toggle').textContent = '⟨/⟩ Source';
  src.textContent = art.code;

  // If this is a doc/pptx/pdf preview, use the pre-rendered HTML
  if (art._previewHtml) {
    frame.srcdoc = _wrapArtHtml(art._previewHtml);
    return;
  }

  let html = art.code;

  if (art.lang === 'jsx' || art.lang === 'js' || art.lang === 'javascript') {
    html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
      <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
      <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
      </head><body><div id="root"></div>
      <script type="text/babel">${art.code}<\/script></body></html>`;
  } else if (art.lang === 'svg') {
    html = `<!DOCTYPE html><html><body style="margin:0;background:#1a1a2e;display:flex;align-items:center;justify-content:center;min-height:100vh">${art.code}</body></html>`;
  } else if (['python','py','c','cpp','java','go','rust','rb','ruby','php','r','swift','kotlin','kt','cs','csharp','bash','sh','matlab','octave'].includes(art.lang)) {
    // Embed OneCompiler iframe and auto-inject + auto-run via postMessage
    const ocLangMap = {
      python:'python', py:'python', c:'c', cpp:'cpp', java:'java',
      go:'go', rust:'rust', rb:'ruby', ruby:'ruby', php:'php',
      r:'r', swift:'swift', kotlin:'kotlin', kt:'kotlin',
      cs:'csharp', csharp:'csharp', bash:'bash', sh:'bash',
      matlab:'octave', octave:'octave'
    };
    const fileExtMap = {
      python:'main.py', py:'main.py', c:'main.c', cpp:'main.cpp',
      java:'Main.java', go:'main.go', rust:'main.rs', rb:'main.rb',
      ruby:'main.rb', php:'main.php', r:'main.r', swift:'main.swift',
      kotlin:'main.kt', kt:'main.kt', cs:'main.cs', csharp:'main.cs',
      bash:'main.sh', sh:'main.sh', matlab:'main.m', octave:'main.m'
    };
    const ocLang = ocLangMap[art.lang] || 'python';
    const fileName = fileExtMap[art.lang] || 'main.txt';

    // Octave on OneCompiler has no graphics toolkit (no gnuplot, no X11).
    // Inject a preamble that catches the error gracefully and prints a notice,
    // so non-graphics code still runs while plots fail with a clear message.
    let runCode = art.code;
    if (['octave','matlab'].includes(art.lang)) {
      runCode = [
        "% -- Atlas: headless graphics notice --",
        "try",
        "  graphics_toolkit('fltk');",
        "catch e",
        "  try",
        "    graphics_toolkit('qt');",
        "  catch e2",
        "    fprintf('\\n=== GRAPHICS NOT AVAILABLE ===\\n');",
        "    fprintf('Graphics/plots are not available in this embedded runner.\\n');",
        "    fprintf('To run with full graphics support, copy your code and run it in MATLAB or Octave locally.\\n');",
        "    fprintf('==============================\\n\\n');",
        "    function figure(varargin), fprintf('[figure() skipped — no graphics toolkit]\\n'); end",
        "    function plot(varargin), fprintf('[plot() skipped — no graphics toolkit]\\n'); end",
        "    function surf(varargin), fprintf('[surf() skipped — no graphics toolkit]\\n'); end",
        "    function mesh(varargin), fprintf('[mesh() skipped — no graphics toolkit]\\n'); end",
        "    function bar(varargin), fprintf('[bar() skipped — no graphics toolkit]\\n'); end",
        "    function hist(varargin), fprintf('[hist() skipped — no graphics toolkit]\\n'); end",
        "    function scatter(varargin), fprintf('[scatter() skipped — no graphics toolkit]\\n'); end",
        "    function imagesc(varargin), fprintf('[imagesc() skipped — no graphics toolkit]\\n'); end",
        "    function imshow(varargin), fprintf('[imshow() skipped — no graphics toolkit]\\n'); end",
        "    function xlabel(varargin), end",
        "    function ylabel(varargin), end",
        "    function zlabel(varargin), end",
        "    function title(varargin), end",
        "    function legend(varargin), end",
        "    function grid(varargin), end",
        "    function hold(varargin), end",
        "    function colorbar(varargin), end",
        "    function saveas(varargin), end",
        "    function print(varargin), end",
        "  end",
        "end",
        ""
      ].join("\n") + art.code;
    }
    const codeJson = JSON.stringify(runCode);
    const fileNameJson = JSON.stringify(fileName);
    const isMatlab = ['octave','matlab'].includes(art.lang);
    const originalCodeJson = JSON.stringify(art.code);
    html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      html,body{width:100%;height:100%;overflow:hidden;background:#0c0c14;display:flex;flex-direction:column}
      #oc-banner{display:none;align-items:center;gap:10px;padding:7px 12px;background:#1a1025;border-bottom:1px solid #4a3faa;font-family:system-ui,sans-serif;font-size:11px;color:#c0aaff;flex-shrink:0}
      #oc-banner.visible{display:flex}
      #oc-banner strong{color:#ff9f5a}
      #oc-banner button{margin-left:auto;padding:3px 10px;background:#7c6aff22;border:1px solid #7c6aff88;border-radius:4px;color:#b0a0ff;font-size:11px;cursor:pointer;white-space:nowrap}
      #oc-banner button:hover{background:#7c6aff44}
      #oc-banner button.copied{color:#2dd4a0;border-color:#2dd4a0}
      iframe{flex:1;width:100%;border:none;display:block;min-height:0}
    </style></head><body>
    ${isMatlab ? `<div id="oc-banner"><span>⚠ <strong>Graphics/plots are not available in this embedded runner.</strong> To use full graphics, copy your code and run it in MATLAB or Octave locally.</span><button id="copy-btn" onclick="copyCode()">📋 Copy code</button></div>` : ''}
    <iframe id="oc" src="https://onecompiler.com/embed/${ocLang}?listenToEvents=true&hideTitle=true&hideNew=true&hideLanguageSelection=true&theme=dark" allowfullscreen allow="clipboard-write"></iframe>
    <script>
    const CODE = ${codeJson};
    const ORIGINAL_CODE = ${originalCodeJson};
    const FILE = ${fileNameJson};
    const LANG = ${JSON.stringify(ocLang)};
    const IS_MATLAB = ${isMatlab};
    const iframe = document.getElementById('oc');
    let injected = false;
    let attempts = 0;

    function copyCode() {
      navigator.clipboard.writeText(ORIGINAL_CODE).then(function() {
        var btn = document.getElementById('copy-btn');
        if (btn) { btn.textContent = '✓ Copied!'; btn.classList.add('copied'); setTimeout(function(){ btn.textContent = '📋 Copy code'; btn.classList.remove('copied'); }, 2000); }
      }).catch(function() {
        var ta = document.createElement('textarea');
        ta.value = ORIGINAL_CODE; ta.style.position='fixed'; ta.style.opacity='0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        var btn = document.getElementById('copy-btn');
        if (btn) { btn.textContent = '✓ Copied!'; btn.classList.add('copied'); setTimeout(function(){ btn.textContent = '📋 Copy code'; btn.classList.remove('copied'); }, 2000); }
      });
    }

    function inject() {
      iframe.contentWindow.postMessage({
        eventType: 'populateCode',
        language: LANG,
        files: [{ name: FILE, content: CODE }]
      }, '*');
    }

    function triggerRun() {
      iframe.contentWindow.postMessage({ eventType: 'triggerRun' }, '*');
    }

    function injectAndRun() {
      if (injected) return;
      injected = true;
      // Show graphics banner for MATLAB/Octave after injection
      if (IS_MATLAB) {
        var banner = document.getElementById('oc-banner');
        if (banner) banner.classList.add('visible');
      }
      // Inject code immediately
      inject();
      // Re-inject after 400ms (iframe may still be initializing)
      setTimeout(inject, 400);
      // Trigger run after code has settled
      setTimeout(triggerRun, 900);
      // Re-trigger in case first one was too early
      setTimeout(triggerRun, 1800);
    }

    // Listen for iframe ready / code-change events
    window.addEventListener('message', function(e) {
      if (!e.data) return;
      // OneCompiler fires language/code events when editor is ready
      if (e.data.language || e.data.type === 'ready' || e.data.eventType === 'editorLoaded') {
        injectAndRun();
      }
    });

    // Primary: inject after iframe load event (most reliable)
    iframe.addEventListener('load', function() {
      setTimeout(injectAndRun, 800);
    });

    // Ultimate fallback: try every second for first 6 seconds
    const fallback = setInterval(function() {
      attempts++;
      if (injected || attempts > 6) { clearInterval(fallback); return; }
      try { inject(); } catch(e) {}
    }, 1000);
    <\/script></body></html>`
  }
  frame.srcdoc = _wrapArtHtml(html);
}

// Wraps artifact HTML with a global error boundary overlay
function _wrapArtHtml(html) {
  const errorScript = `<script>
(function(){
  var _atlasErr = document.getElementById('_atlas_err');
  function showErr(msg, src, line, col) {
    if (!_atlasErr) return;
    _atlasErr.style.display = 'flex';
    var details = msg || 'Unknown error';
    if (line) details += ' (line ' + line + (col ? ':' + col : '') + ')';
    if (src && src !== window.location.href && src !== 'about:srcdoc') details += '\\n' + src;
    _atlasErr.querySelector('._ae_msg').textContent = details;
  }
  window.onerror = function(msg, src, line, col, err) {
    showErr(err ? (err.name + ': ' + err.message) : String(msg), src, line, col);
    return false;
  };
  window.addEventListener('unhandledrejection', function(e) {
    showErr('Unhandled Promise: ' + (e.reason?.message || String(e.reason)));
  });
  // Also catch syntax errors by wrapping DOMContentLoaded check
  document.addEventListener('DOMContentLoaded', function() {
    // If #root exists (React) but is still empty after 3s, surface a hint
    var root = document.getElementById('root');
    if (root) {
      setTimeout(function() {
        if (!root.children.length && _atlasErr) {
          _atlasErr.style.display = 'flex';
          _atlasErr.querySelector('._ae_msg').textContent = 'React component rendered nothing. Check for a missing default export or render error.';
        }
      }, 3000);
    }
  });
})();
<\/script>`;

  const errorOverlay = `<div id="_atlas_err" style="display:none;position:fixed;inset:0;z-index:99999;background:rgba(9,9,15,.92);backdrop-filter:blur(4px);flex-direction:column;align-items:center;justify-content:center;padding:24px;font-family:'DM Mono',monospace;gap:12px">
  <div style="font-size:28px">⚠️</div>
  <div style="color:#ff5f6d;font-size:13px;font-weight:700;letter-spacing:.5px">PREVIEW ERROR</div>
  <pre class="_ae_msg" style="color:#e6e6f0;font-size:11.5px;line-height:1.65;background:rgba(255,95,109,.08);border:1px solid rgba(255,95,109,.25);border-radius:8px;padding:12px 16px;max-width:520px;width:100%;overflow-x:auto;white-space:pre-wrap;word-break:break-all"></pre>
  <div style="font-size:11px;color:#8888aa;text-align:center">Use <strong style="color:#e6e6f0">⟨/⟩ Source</strong> to edit and fix the code</div>
  <button onclick="document.getElementById('_atlas_err').style.display='none'" style="margin-top:4px;padding:6px 16px;background:rgba(255,95,109,.15);border:1px solid rgba(255,95,109,.35);border-radius:6px;color:#ff5f6d;font-size:11px;cursor:pointer;font-family:inherit">Dismiss</button>
</div>`;

  // Inject into HTML — if has </body>, insert before it, otherwise append
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, errorOverlay + errorScript + '</body>');
  }
  return html + errorOverlay + errorScript;
}


function toggleArtSource() {
  const wrap = document.getElementById('artifact-frame-wrap');
  const btn = document.getElementById('art-view-toggle');
  // Exit edit mode if active
  if (document.getElementById('artifact-editor').style.display !== 'none') cancelArtEdit();
  wrap.classList.toggle('src-mode');
  btn.textContent = wrap.classList.contains('src-mode') ? '▶ Preview' : '⟨/⟩ Source';
}

// ── Determines if active artifact needs the visual editor ──
function _isStructuredArt(art) {
  return art && ['docx','pptx','pdf','docx-content','pptx-content','pdf-content','html'].includes(art.lang);
}

function toggleArtEdit() {
  const textEditor   = document.getElementById('artifact-editor');
  const visualEditor = document.getElementById('artifact-visual-editor');
  const isTextOpen   = textEditor.style.display !== 'none';
  const isVisOpen    = visualEditor.style.display !== 'none';

  if (isTextOpen) { cancelArtEdit(); return; }
  if (isVisOpen)  { cancelVisualEdit(); return; }

  const art = _artifacts[_activeArt];
  if (!art) return;

  if (_isStructuredArt(art)) {
    _openVisualEditor(art);
  } else {
    const frame = document.getElementById('artifact-frame');
    const src   = document.getElementById('artifact-source');
    const wrap  = document.getElementById('artifact-frame-wrap');
    frame.style.display = 'none';
    src.style.display   = 'none';
    wrap.classList.remove('src-mode');
    textEditor.style.display = 'flex';
    document.getElementById('artifact-edit-area').value = art.code;
    document.getElementById('art-edit-toggle').classList.add('active');
    document.getElementById('art-view-toggle').disabled = true;
  }
}

function cancelArtEdit() {
  const editor = document.getElementById('artifact-editor');
  const frame  = document.getElementById('artifact-frame');
  const src    = document.getElementById('artifact-source');
  editor.style.display = 'none';
  frame.style.display  = '';
  src.style.display    = '';
  document.getElementById('art-edit-toggle').classList.remove('active');
  document.getElementById('art-view-toggle').disabled = false;
}

// ════════════════════════════════════════════════════════
//  OFFICE-STYLE VISUAL EDITORS  (DOCX Word + PPTX PowerPoint)
// ════════════════════════════════════════════════════════
const SLIDE_COLORS = ['#4c3fcf','#1a6fb3','#b85c1a','#1a7a44','#a0201e','#6b2c99','#1e6b7a','#7a4f1a','#2c5282','#553c9a'];

// ── State ──
let _veArt = null;
let _veFmt = null;
let _veActiveSlidIdx = 0;
let _veSlides = [];

// ── Helpers ──
function _veEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _veHide(){ document.getElementById('artifact-frame').style.display=''; document.getElementById('artifact-source').style.display=''; document.getElementById('artifact-visual-editor').style.display='none'; document.getElementById('art-edit-toggle').classList.remove('active'); document.getElementById('art-view-toggle').disabled=false; }

// Ctrl+Z inside visual editor → veUndo
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    const ve = document.getElementById('artifact-visual-editor');
    if (ve && ve.style.display !== 'none') {
      // For PPTX use our stack; for DOCX let the browser handle it unless focus is outside contenteditable
      if (_veFmt === 'pptx') {
        e.preventDefault();
        veUndo();
      }
      // DOCX: browser handles Ctrl+Z natively in contenteditable — no interception needed
    }
  }
});

function _openVisualEditor(art) {
  // HTML gets its own live iframe editor
  if (art.lang === 'html') { _openHtmlVisualEditor(art); return; }

  let data;
  try { data = parseModelJSON(art.code); } catch(e) { toast('Cannot open visual editor: invalid JSON', 'er'); return; }

  // ── SAVE current editor state before wiping the DOM ──────────────────
  // This prevents content from one doc bleeding into another: serialize
  // the currently open document back into its art.code BEFORE clearing body.
  if (_veArt && _veArt !== art) {
    try {
      const savedCode = _veSerialize();
      if (savedCode) _veArt.code = savedCode;
    } catch(_) {}
  }

  _veArt = art;
  const isPptx = art.lang === 'pptx' || art.lang === 'pptx-content';
  _veFmt = isPptx ? 'pptx' : 'docx';

  const frame = document.getElementById('artifact-frame');
  const src   = document.getElementById('artifact-source');
  const ve    = document.getElementById('artifact-visual-editor');
  frame.style.display = 'none';
  src.style.display   = 'none';
  document.getElementById('artifact-frame-wrap').classList.remove('src-mode');
  ve.style.display    = 'flex';
  document.getElementById('art-edit-toggle').classList.add('active');
  document.getElementById('art-view-toggle').disabled = true;

  document.getElementById('ve-tab-label').textContent = isPptx ? 'Presentation' : 'Document';
  document.getElementById('ve-fmt-bar').style.display = isPptx ? 'none' : '';
  const pptFmtBar = document.getElementById('ve-ppt-fmt-bar');
  if (pptFmtBar) pptFmtBar.style.display = isPptx ? '' : 'none';

  // Undo button: always visible; DOCX relies on browser execCommand, PPTX uses history stack
  const undoBtn = document.getElementById('ve-undo-btn');
  if (undoBtn) undoBtn.style.display = '';

  const body = document.getElementById('ve-body');
  body.innerHTML = '';

  if (isPptx) _veBuildPptx(body, data);
  else        _veBuildDocx(body, data);
}

// ═══════════════════════════════════════════════════════════
//  HTML VISUAL EDITOR — full WYSIWYG with properties panel
// ═══════════════════════════════════════════════════════════
let _hveArt = null;
let _hveSelected = null;
let _hveIframe = null;
let _hveMode = 'visual'; // 'visual' | 'code'

function _openHtmlVisualEditor(art) {
  _hveArt = art;
  _hveMode = 'visual';

  const frame = document.getElementById('artifact-frame');
  const src   = document.getElementById('artifact-source');
  const ve    = document.getElementById('artifact-visual-editor');
  frame.style.display = 'none';
  src.style.display   = 'none';
  document.getElementById('artifact-frame-wrap').classList.remove('src-mode');
  ve.style.display    = 'flex';
  document.getElementById('art-edit-toggle').classList.add('active');
  document.getElementById('art-view-toggle').disabled = true;

  document.getElementById('ve-tab-label').textContent = 'HTML Visual Editor';
  const fmtBar = document.getElementById('ve-fmt-bar');
  if (fmtBar) fmtBar.style.display = 'none';
  const pptBar = document.getElementById('ve-ppt-fmt-bar');
  if (pptBar) pptBar.style.display = 'none';
  document.getElementById('ve-undo-btn').style.display = 'none';

  const body = document.getElementById('ve-body');
  body.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;';
  body.innerHTML = `
  <style>
    #hve-toolbar{display:flex;align-items:center;gap:4px;padding:6px 10px;background:#1a1a2e;border-bottom:1px solid rgba(255,255,255,.1);flex-shrink:0;flex-wrap:wrap}
    .hve-tbtn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.8);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-family:'DM Sans',sans-serif;transition:all .12s;white-space:nowrap}
    .hve-tbtn:hover{background:rgba(255,255,255,.15);color:#fff}
    .hve-tbtn.active{background:#4c3fcf;border-color:#4c3fcf;color:#fff}
    .hve-tsep{width:1px;height:18px;background:rgba(255,255,255,.15);margin:0 2px;flex-shrink:0}
    #hve-main{flex:1;display:flex;overflow:hidden;min-height:0}
    #hve-canvas{flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative}
    #hve-breadcrumb-bar{background:#0f0f1a;color:rgba(255,255,255,.45);font-size:10px;padding:3px 10px;font-family:'DM Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.07)}
    #hve-iframe{flex:1;border:none;background:#fff;display:block}
    #hve-code-area{display:none;flex:1;background:#0c0c14;color:#e8e8e8;font-family:'DM Mono',monospace;font-size:12px;line-height:1.6;padding:14px;border:none;outline:none;resize:none;tab-size:2}
    #hve-panel{width:272px;flex-shrink:0;background:#12121f;border-left:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;overflow:hidden}
    #hve-panel-hdr{padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.1);font-size:11px;font-weight:600;color:#8090c0;font-family:'DM Sans',sans-serif;flex-shrink:0;display:flex;align-items:center;justify-content:space-between}
    #hve-props{flex:1;overflow-y:auto;padding:10px 12px;font-family:'DM Sans',sans-serif}
    #hve-props::-webkit-scrollbar{width:4px}
    #hve-props::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:2px}
    .hve-section{font-size:10px;font-weight:700;color:#5060a0;text-transform:uppercase;letter-spacing:.07em;margin:12px 0 6px;padding-bottom:3px;border-bottom:1px solid rgba(255,255,255,.07)}
    .hve-row{margin-bottom:7px}
    .hve-lbl{font-size:10px;color:rgba(255,255,255,.4);margin-bottom:2px}
    .hve-inp{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#e0e0f0;border-radius:4px;padding:4px 7px;font-size:11px;font-family:'DM Mono',monospace;outline:none;width:100%;box-sizing:border-box;transition:border-color .12s}
    .hve-inp:focus{border-color:rgba(124,106,255,.5);background:rgba(255,255,255,.1)}
    .hve-inp::placeholder{color:rgba(255,255,255,.2)}
    textarea.hve-inp{resize:vertical;min-height:52px;line-height:1.5}
    select.hve-inp{cursor:pointer}
    select.hve-inp option{background:#1a1a2e}
    .hve-color-row{display:flex;gap:6px;align-items:center}
    .hve-color-row input[type=color]{width:32px;height:28px;border:1px solid rgba(255,255,255,.15);border-radius:4px;cursor:pointer;background:transparent;padding:0;flex-shrink:0}
    .hve-2col{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .hve-tag-badge{display:inline-block;background:rgba(124,106,255,.2);color:#a090ff;padding:1px 6px;border-radius:3px;font-size:10px;font-family:'DM Mono',monospace;margin-bottom:6px}
    .hve-img-preview{width:100%;max-height:80px;object-fit:contain;border-radius:4px;border:1px solid rgba(255,255,255,.1);margin-top:4px;background:#0a0a14}
    .hve-action-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.7);padding:5px 8px;border-radius:4px;cursor:pointer;font-size:11px;font-family:'DM Sans',sans-serif;transition:all .12s;width:100%;text-align:left}
    .hve-action-btn:hover{background:rgba(255,255,255,.15)}
    #hve-panel-footer{padding:8px 10px;border-top:1px solid rgba(255,255,255,.1);flex-shrink:0;display:flex;flex-direction:column;gap:5px}
    .hve-apply-btn{background:#4c3fcf;border:none;color:#fff;padding:7px 0;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;font-family:'DM Sans',sans-serif;width:100%;transition:background .12s}
    .hve-apply-btn:hover{background:#5d50e0}
    .hve-cancel-btn{background:transparent;border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.55);padding:5px 0;border-radius:6px;cursor:pointer;font-size:11px;font-family:'DM Sans',sans-serif;width:100%}
    .hve-cancel-btn:hover{background:rgba(255,255,255,.07)}
    #hve-empty{color:rgba(255,255,255,.25);font-size:11px;text-align:center;margin-top:50px;line-height:1.8}
  </style>
  <div id="hve-toolbar">
    <button class="hve-tbtn active" id="hve-btn-visual" onclick="hveSetMode('visual')">◉ Visual</button>
    <button class="hve-tbtn" id="hve-btn-code" onclick="hveSetMode('code')">⟨/⟩ Code</button>
    <div class="hve-tsep"></div>
    <button class="hve-tbtn" onclick="hveExecCmd('bold')" title="Bold"><b>B</b></button>
    <button class="hve-tbtn" onclick="hveExecCmd('italic')" title="Italic"><i>I</i></button>
    <button class="hve-tbtn" onclick="hveExecCmd('underline')" title="Underline"><u>U</u></button>
    <div class="hve-tsep"></div>
    <button class="hve-tbtn" onclick="hveInsertImage()" title="Insert image">🖼 Image</button>
    <button class="hve-tbtn" onclick="hveInsertLink()" title="Insert link">🔗 Link</button>
    <button class="hve-tbtn" onclick="hveInsertElement('div')" title="Insert div">+ Div</button>
    <button class="hve-tbtn" onclick="hveInsertElement('p')" title="Insert paragraph">+ P</button>
    <button class="hve-tbtn" onclick="hveInsertElement('button')" title="Insert button">+ Button</button>
    <div class="hve-tsep"></div>
    <button class="hve-tbtn" onclick="hveDeleteSelected()" title="Delete selected element" style="color:#ff7a7a">✕ Delete</button>
    <div style="flex:1"></div>
    <button class="hve-tbtn" onclick="hveUndo()" title="Undo (Ctrl+Z)">↩ Undo</button>
  </div>
  <div id="hve-main">
    <div id="hve-canvas">
      <div id="hve-breadcrumb-bar">Click any element to select it</div>
      <iframe id="hve-iframe" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
      <textarea id="hve-code-area" spellcheck="false" oninput="hveCodeInput()"></textarea>
    </div>
    <div id="hve-panel">
      <div id="hve-panel-hdr">
        <span>PROPERTIES</span>
        <span id="hve-panel-hint" style="font-size:9px;font-weight:400;color:rgba(255,255,255,.25)">select an element</span>
      </div>
      <div id="hve-props"><div id="hve-empty">Click any element<br>in the preview to<br>edit its properties</div></div>
      <div id="hve-panel-footer">
        <button class="hve-apply-btn" onclick="hveApply()">✓ Apply Changes</button>
        <button class="hve-cancel-btn" onclick="hveCancel()">✕ Discard & Close</button>
      </div>
    </div>
  </div>`;

  _hveIframe = document.getElementById('hve-iframe');
  _hveIframe.srcdoc = art.code;
  _hveIframe.onload = () => _hveInjectInteractivity();
}

function hveSetMode(mode) {
  _hveMode = mode;
  const iframe = document.getElementById('hve-iframe');
  const codeArea = document.getElementById('hve-code-area');
  const vBtn = document.getElementById('hve-btn-visual');
  const cBtn = document.getElementById('hve-btn-code');
  const panel = document.getElementById('hve-panel');
  if (mode === 'code') {
    // Sync current iframe state to code area
    const doc = _hveIframe && _hveIframe.contentDocument;
    if (doc) {
      codeArea.value = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    }
    if (iframe) iframe.style.display = 'none';
    if (codeArea) codeArea.style.display = 'block';
    if (panel) panel.style.display = 'none';
    vBtn.classList.remove('active'); cBtn.classList.add('active');
  } else {
    // Apply code edits back to iframe
    if (codeArea.style.display !== 'none' && codeArea.value.trim()) {
      _hveIframe.srcdoc = codeArea.value;
      _hveIframe.onload = () => _hveInjectInteractivity();
    }
    if (iframe) iframe.style.display = 'block';
    if (codeArea) codeArea.style.display = 'none';
    if (panel) panel.style.display = 'flex';
    cBtn.classList.remove('active'); vBtn.classList.add('active');
  }
}

function hveCodeInput() {
  // live preview disabled in code mode to avoid cursor jump; applied on switch back
}

function _hveInjectInteractivity() {
  const doc = _hveIframe && _hveIframe.contentDocument;
  if (!doc || !doc.documentElement) return;

  // Remove previous injected style
  const prev = doc.getElementById('__hve_style');
  if (prev) prev.remove();

  const style = doc.createElement('style');
  style.id = '__hve_style';
  style.textContent = `
    .__hve_hover{outline:2px dashed rgba(124,106,255,.55)!important;outline-offset:1px!important;cursor:pointer!important}
    .__hve_selected{outline:2px solid #7c6aff!important;outline-offset:1px!important}
  `;
  doc.head.appendChild(style);

  doc.addEventListener('click', function(e) {
    const a = e.target.closest('a');
    if (a) e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    if (el === doc.documentElement || el === doc.body) return;
    _hveSelectEl(el);
  }, true);

  doc.addEventListener('mouseover', function(e) {
    const el = e.target;
    if (el === doc.documentElement || el === doc.body) return;
    if (!el.classList.contains('__hve_selected')) el.classList.add('__hve_hover');
  });
  doc.addEventListener('mouseout', function(e) {
    e.target.classList.remove('__hve_hover');
  });
}

function _hveSelectEl(el) {
  const doc = _hveIframe.contentDocument;
  doc.querySelectorAll('.__hve_selected').forEach(e => e.classList.remove('__hve_selected'));
  _hveSelected = el;
  el.classList.add('__hve_selected');

  // Breadcrumb path
  const path = [];
  let cur = el;
  while (cur && cur !== doc.body && path.length < 5) {
    const tag = cur.tagName.toLowerCase();
    const id = cur.id ? '#' + cur.id : '';
    const cls = cur.className ? '.' + String(cur.className).split(' ').filter(x=>x&&!x.startsWith('__hve')).slice(0,2).join('.') : '';
    path.unshift(tag + id + cls);
    cur = cur.parentElement;
  }
  const bc = document.getElementById('hve-breadcrumb-bar');
  if (bc) bc.textContent = 'body > ' + path.join(' > ');
  document.getElementById('hve-panel-hint').textContent = el.tagName.toLowerCase();

  _hveRenderPanel(el);
}

function _hveGetInlineStyle(el, prop) {
  const s = el.getAttribute('style') || '';
  const m = s.match(new RegExp('(?:^|;)\\s*' + prop.replace('-','\\-') + '\\s*:\\s*([^;]+)'));
  return m ? m[1].trim() : '';
}

function _hveSetInlineStyle(el, prop, val) {
  const existing = el.getAttribute('style') || '';
  const re = new RegExp('(?:^|;\\s*)' + prop.replace('-','\\-') + '\\s*:[^;]*', 'g');
  let cleaned = existing.replace(re, '').replace(/^;+/, '').replace(/;+$/, '').trim();
  if (val && val.trim()) {
    el.setAttribute('style', (cleaned ? cleaned + '; ' : '') + prop + ': ' + val.trim());
  } else {
    el.setAttribute('style', cleaned);
  }
}

function _hveColorHex(val) {
  if (!val) return '#000000';
  if (/^#[0-9a-f]{6}$/i.test(val)) return val;
  if (/^#[0-9a-f]{3}$/i.test(val)) {
    return '#' + val.slice(1).split('').map(x=>x+x).join('');
  }
  try {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = val; ctx.fillRect(0,0,1,1);
    const d = ctx.getImageData(0,0,1,1).data;
    return '#' + [d[0],d[1],d[2]].map(x=>x.toString(16).padStart(2,'0')).join('');
  } catch(e) { return '#000000'; }
}

function _hveRow(label, inputHtml) {
  return `<div class="hve-row"><div class="hve-lbl">${label}</div>${inputHtml}</div>`;
}

function _hveRenderPanel(el) {
  const tag = el.tagName.toLowerCase();
  const isText = ['p','h1','h2','h3','h4','h5','h6','span','a','li','td','th','label','button','div','section','article','header','footer','nav','main'].includes(tag);
  const isImg = tag === 'img';
  const isAnchor = tag === 'a';
  const isInput = ['input','textarea','select'].includes(tag);

  const g = prop => _hveGetInlineStyle(el, prop);
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let html = `<span class="hve-tag-badge">&lt;${esc(tag)}&gt;</span>`;

  // ── CONTENT ──
  if (isText || isInput) {
    html += `<div class="hve-section">Content</div>`;
    if (isInput) {
      html += _hveRow('Value / Placeholder', `<input class="hve-inp" id="hve-p-val" type="text" value="${esc(el.value||el.getAttribute('placeholder')||'')}" oninput="hveP('val')">`);
    } else if (!el.querySelector('img,iframe,video,canvas')) {
      html += _hveRow('Text Content', `<textarea class="hve-inp" id="hve-p-text" rows="3" oninput="hveP('text')">${esc(el.innerText||el.textContent||'')}</textarea>`);
    }
  }

  if (isAnchor) {
    html += _hveRow('Href / URL', `<input class="hve-inp" id="hve-p-href" type="text" value="${esc(el.getAttribute('href')||'')}" oninput="hveP('href')" placeholder="https://">`);
    html += _hveRow('Target', `<select class="hve-inp" id="hve-p-target" onchange="hveP('target')"><option value="">—</option><option value="_blank" ${el.getAttribute('target')==='_blank'?'selected':''}>_blank (new tab)</option><option value="_self" ${el.getAttribute('target')==='_self'?'selected':''}>_self</option></select>`);
  }

  if (isImg) {
    html += `<div class="hve-section">Image</div>`;
    html += _hveRow('Src URL', `<input class="hve-inp" id="hve-p-src" type="text" value="${esc(el.getAttribute('src')||'')}" oninput="hveP('src')" placeholder="https:// or data:...">`);
    html += `<div style="margin-bottom:6px"><button class="hve-action-btn" onclick="hveUploadImage()">📁 Upload local image…</button></div>`;
    if (el.getAttribute('src')) html += `<img class="hve-img-preview" src="${esc(el.getAttribute('src'))}" onerror="this.style.display='none'">`;
    html += _hveRow('Alt text', `<input class="hve-inp" id="hve-p-alt" type="text" value="${esc(el.getAttribute('alt')||'')}" oninput="hveP('alt')">`);
    html += _hveRow('Width', `<input class="hve-inp" id="hve-p-w" type="text" value="${esc(el.getAttribute('width')||g('width'))}" oninput="hveP('w')" placeholder="e.g. 100%">`);
    html += _hveRow('Height', `<input class="hve-inp" id="hve-p-h" type="text" value="${esc(el.getAttribute('height')||g('height'))}" oninput="hveP('h')" placeholder="e.g. auto">`);
  }

  // ── TYPOGRAPHY ──
  html += `<div class="hve-section">Typography</div>`;
  html += `<div class="hve-2col">`;
  html += _hveRow('Font size', `<input class="hve-inp" id="hve-p-fs" type="text" value="${esc(g('font-size'))}" oninput="hveP('fs')" placeholder="16px">`);
  html += _hveRow('Weight', `<select class="hve-inp" id="hve-p-fw" onchange="hveP('fw')"><option value="">—</option><option value="300">Light</option><option value="400">Normal</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">ExtraBold</option><option value="900">Black</option></select>`);
  html += `</div>`;
  html += `<div class="hve-2col">`;
  html += _hveRow('Line height', `<input class="hve-inp" id="hve-p-lh" type="text" value="${esc(g('line-height'))}" oninput="hveP('lh')" placeholder="1.5">`);
  html += _hveRow('Text align', `<select class="hve-inp" id="hve-p-ta" onchange="hveP('ta')"><option value="">—</option><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select>`);
  html += `</div>`;

  // ── COLORS ──
  html += `<div class="hve-section">Colors</div>`;
  const colorVal = g('color') || el.style.color;
  const bgVal = g('background-color') || g('background') || el.style.backgroundColor;
  html += _hveRow('Text color', `<div class="hve-color-row"><input type="color" id="hve-p-color-cp" value="${_hveColorHex(colorVal)}" oninput="hveSyncColor('color')"><input class="hve-inp" id="hve-p-color" type="text" value="${esc(colorVal)}" oninput="hveSyncColorText('color')" placeholder="inherit" style="flex:1"></div>`);
  html += _hveRow('Background', `<div class="hve-color-row"><input type="color" id="hve-p-bg-cp" value="${_hveColorHex(bgVal)}" oninput="hveSyncColor('bg')"><input class="hve-inp" id="hve-p-bg" type="text" value="${esc(bgVal)}" oninput="hveSyncColorText('bg')" placeholder="transparent" style="flex:1"></div>`);

  // ── SPACING ──
  html += `<div class="hve-section">Spacing & Size</div>`;
  html += `<div class="hve-2col">`;
  html += _hveRow('Padding', `<input class="hve-inp" id="hve-p-pad" type="text" value="${esc(g('padding'))}" oninput="hveP('pad')" placeholder="8px 16px">`);
  html += _hveRow('Margin', `<input class="hve-inp" id="hve-p-mar" type="text" value="${esc(g('margin'))}" oninput="hveP('mar')" placeholder="0 auto">`);
  html += `</div>`;
  html += `<div class="hve-2col">`;
  if (!isImg) {
    html += _hveRow('Width', `<input class="hve-inp" id="hve-p-w" type="text" value="${esc(g('width'))}" oninput="hveP('w')" placeholder="auto">`);
    html += _hveRow('Height', `<input class="hve-inp" id="hve-p-h" type="text" value="${esc(g('height'))}" oninput="hveP('h')" placeholder="auto">`);
  }
  html += `</div>`;
  html += `<div class="hve-2col">`;
  html += _hveRow('Border radius', `<input class="hve-inp" id="hve-p-br" type="text" value="${esc(g('border-radius'))}" oninput="hveP('br')" placeholder="8px">`);
  html += _hveRow('Border', `<input class="hve-inp" id="hve-p-border" type="text" value="${esc(g('border'))}" oninput="hveP('border')" placeholder="1px solid #ccc">`);
  html += `</div>`;

  // ── LAYOUT ──
  html += `<div class="hve-section">Layout</div>`;
  html += `<div class="hve-2col">`;
  html += _hveRow('Display', `<select class="hve-inp" id="hve-p-disp" onchange="hveP('disp')"><option value="">—</option><option value="block">block</option><option value="inline">inline</option><option value="inline-block">inline-block</option><option value="flex">flex</option><option value="grid">grid</option><option value="none">none</option></select>`);
  html += _hveRow('Position', `<select class="hve-inp" id="hve-p-pos" onchange="hveP('pos')"><option value="">—</option><option value="static">static</option><option value="relative">relative</option><option value="absolute">absolute</option><option value="fixed">fixed</option><option value="sticky">sticky</option></select>`);
  html += `</div>`;
  html += `<div class="hve-2col">`;
  html += _hveRow('Opacity', `<input class="hve-inp" id="hve-p-op" type="text" value="${esc(g('opacity'))}" oninput="hveP('op')" placeholder="1">`);
  html += _hveRow('Z-index', `<input class="hve-inp" id="hve-p-zi" type="text" value="${esc(g('z-index'))}" oninput="hveP('zi')" placeholder="auto">`);
  html += `</div>`;

  // ── ATTRIBUTES ──
  html += `<div class="hve-section">Attributes</div>`;
  html += _hveRow('Class', `<input class="hve-inp" id="hve-p-class" type="text" value="${esc((el.getAttribute('class')||'').replace(/\b__hve_\w+/g,'').trim())}" oninput="hveP('class')">`);
  html += _hveRow('ID', `<input class="hve-inp" id="hve-p-id" type="text" value="${esc(el.getAttribute('id')||'')}" oninput="hveP('id')">`);

  // ── RAW STYLE ──
  html += `<div class="hve-section">Raw Style</div>`;
  html += `<div class="hve-row"><textarea class="hve-inp" id="hve-p-style" rows="3" oninput="hveRawStyle()">${esc((el.getAttribute('style')||''))}</textarea></div>`;

  document.getElementById('hve-props').innerHTML = html;

  // Set select values after render
  const setSelect = (id, val) => { const s = document.getElementById(id); if (s && val) s.value = val; };
  setSelect('hve-p-fw', g('font-weight') || el.style.fontWeight);
  setSelect('hve-p-ta', g('text-align') || el.style.textAlign);
  setSelect('hve-p-disp', g('display') || el.style.display);
  setSelect('hve-p-pos', g('position') || el.style.position);
}

// Live preview handlers
function hveP(prop) {
  if (!_hveSelected) return;
  const el = _hveSelected;
  const v = id => { const e = document.getElementById(id); return e ? e.value : null; };
  const ss = (p, val) => { if (val !== null) _hveSetInlineStyle(el, p, val); };

  if (prop === 'text')   { const t = v('hve-p-text'); if (t !== null && !el.querySelector('img,iframe')) el.innerText = t; }
  if (prop === 'href')   { const t = v('hve-p-href'); if (t !== null) el.setAttribute('href', t); }
  if (prop === 'target') { const t = v('hve-p-target'); if (t) el.setAttribute('target', t); else el.removeAttribute('target'); }
  if (prop === 'src')    { const t = v('hve-p-src'); if (t !== null) { el.setAttribute('src', t); const prev = document.querySelector('.hve-img-preview'); if (prev) prev.src = t; } }
  if (prop === 'alt')    { const t = v('hve-p-alt'); if (t !== null) el.setAttribute('alt', t); }
  if (prop === 'val')    { const t = v('hve-p-val'); if (t !== null) { el.value = t; el.setAttribute('placeholder', t); } }
  if (prop === 'class')  { const t = v('hve-p-class'); if (t !== null) el.setAttribute('class', t + (t ? ' ' : '') + '__hve_selected'); }
  if (prop === 'id')     { const t = v('hve-p-id'); if (t !== null) el.setAttribute('id', t); }
  if (prop === 'fs')     ss('font-size', v('hve-p-fs'));
  if (prop === 'fw')     ss('font-weight', v('hve-p-fw'));
  if (prop === 'lh')     ss('line-height', v('hve-p-lh'));
  if (prop === 'ta')     ss('text-align', v('hve-p-ta'));
  if (prop === 'pad')    ss('padding', v('hve-p-pad'));
  if (prop === 'mar')    ss('margin', v('hve-p-mar'));
  if (prop === 'w')      { ss('width', v('hve-p-w')); if (_hveSelected.tagName.toLowerCase()==='img') el.setAttribute('width', v('hve-p-w')||''); }
  if (prop === 'h')      { ss('height', v('hve-p-h')); if (_hveSelected.tagName.toLowerCase()==='img') el.setAttribute('height', v('hve-p-h')||''); }
  if (prop === 'br')     ss('border-radius', v('hve-p-br'));
  if (prop === 'border') ss('border', v('hve-p-border'));
  if (prop === 'disp')   ss('display', v('hve-p-disp'));
  if (prop === 'pos')    ss('position', v('hve-p-pos'));
  if (prop === 'op')     ss('opacity', v('hve-p-op'));
  if (prop === 'zi')     ss('z-index', v('hve-p-zi'));
  // Sync raw style field
  const rs = document.getElementById('hve-p-style');
  if (rs) rs.value = el.getAttribute('style') || '';
}

function hveSyncColor(which) {
  if (!_hveSelected) return;
  const cp = document.getElementById(which === 'color' ? 'hve-p-color-cp' : 'hve-p-bg-cp');
  const tf = document.getElementById(which === 'color' ? 'hve-p-color' : 'hve-p-bg');
  if (!cp || !tf) return;
  tf.value = cp.value;
  _hveSetInlineStyle(_hveSelected, which === 'color' ? 'color' : 'background-color', cp.value);
  const rs = document.getElementById('hve-p-style');
  if (rs) rs.value = _hveSelected.getAttribute('style') || '';
}
function hveSyncColorText(which) {
  if (!_hveSelected) return;
  const tf = document.getElementById(which === 'color' ? 'hve-p-color' : 'hve-p-bg');
  const cp = document.getElementById(which === 'color' ? 'hve-p-color-cp' : 'hve-p-bg-cp');
  if (!tf || !cp) return;
  cp.value = _hveColorHex(tf.value);
  _hveSetInlineStyle(_hveSelected, which === 'color' ? 'color' : 'background-color', tf.value);
  const rs = document.getElementById('hve-p-style');
  if (rs) rs.value = _hveSelected.getAttribute('style') || '';
}

function hveRawStyle() {
  const ta = document.getElementById('hve-p-style');
  if (ta && _hveSelected) _hveSelected.setAttribute('style', ta.value);
}

function hveExecCmd(cmd) {
  const doc = _hveIframe && _hveIframe.contentDocument;
  if (!doc) return;
  doc.execCommand(cmd, false, null);
}

function hveInsertImage() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = function() {
    if (!input.files[0]) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const doc = _hveIframe && _hveIframe.contentDocument;
      if (!doc) return;
      const img = doc.createElement('img');
      img.src = e.target.result;
      img.style.cssText = 'max-width:100%;height:auto;display:block';
      const target = _hveSelected || doc.body;
      target.appendChild(img);
      _hveSelectEl(img);
    };
    reader.readAsDataURL(input.files[0]);
  };
  input.click();
}

function hveUploadImage() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = function() {
    if (!input.files[0]) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      if (!_hveSelected) return;
      _hveSelected.setAttribute('src', e.target.result);
      const srcInp = document.getElementById('hve-p-src');
      if (srcInp) srcInp.value = e.target.result;
      const prev = document.querySelector('.hve-img-preview');
      if (prev) { prev.src = e.target.result; prev.style.display = 'block'; }
    };
    reader.readAsDataURL(input.files[0]);
  };
  input.click();
}

function hveInsertLink() {
  const doc = _hveIframe && _hveIframe.contentDocument;
  if (!doc) return;
  const url = prompt('Enter URL:');
  if (!url) return;
  const text = prompt('Link text:') || url;
  const a = doc.createElement('a');
  a.href = url; a.textContent = text; a.target = '_blank';
  const target = _hveSelected || doc.body;
  target.appendChild(a);
  _hveSelectEl(a);
}

function hveInsertElement(tag) {
  const doc = _hveIframe && _hveIframe.contentDocument;
  if (!doc) return;
  const el = doc.createElement(tag);
  if (tag === 'div') { el.style.cssText = 'padding:16px;background:rgba(0,0,0,.05);border-radius:6px;margin:8px 0'; el.textContent = 'New div'; }
  else if (tag === 'p') { el.textContent = 'New paragraph'; }
  else if (tag === 'button') { el.textContent = 'Button'; el.style.cssText = 'padding:8px 16px;background:#4c3fcf;color:#fff;border:none;border-radius:6px;cursor:pointer'; }
  const target = _hveSelected || doc.body;
  target.appendChild(el);
  _hveSelectEl(el);
}

function hveDeleteSelected() {
  if (!_hveSelected) return;
  const doc = _hveIframe.contentDocument;
  if (_hveSelected.parentNode) _hveSelected.parentNode.removeChild(_hveSelected);
  _hveSelected = null;
  document.getElementById('hve-props').innerHTML = '<div id="hve-empty">Click any element<br>in the preview to<br>edit its properties</div>';
  document.getElementById('hve-breadcrumb-bar').textContent = 'Element deleted — click another to select';
}

function hveUndo() {
  const doc = _hveIframe && _hveIframe.contentDocument;
  if (doc) doc.execCommand('undo', false, null);
}

function hveApply() {
  if (!_hveIframe || !_hveIframe.contentDocument) { hveCancel(); return; }
  const doc = _hveIframe.contentDocument;

  // Clean up injected helpers
  const injStyle = doc.getElementById('__hve_style');
  if (injStyle) injStyle.remove();
  doc.querySelectorAll('.__hve_hover,.__hve_selected').forEach(e => {
    e.classList.remove('__hve_hover', '__hve_selected');
    if (!e.getAttribute('class')) e.removeAttribute('class');
  });

  // Get final code — prefer code area if in code mode
  let newCode;
  if (_hveMode === 'code') {
    const ca = document.getElementById('hve-code-area');
    newCode = ca ? ca.value : ('<!DOCTYPE html>\n' + doc.documentElement.outerHTML);
  } else {
    newCode = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }

  if (_hveArt) {
    _hveArt.code = newCode;
    const frame = document.getElementById('artifact-frame');
    frame.srcdoc = newCode;
    const idx = _artifacts.indexOf(_hveArt);
    if (idx !== -1) _artifacts[idx] = _hveArt;
    const entry = S.codeStore && S.codeStore.get(_hveArt.id);
    if (entry) { entry.content = newCode; S.codeStore.set(_hveArt.id, entry); }
    persist();
    toast('HTML changes applied', 'ok');
  }
  hveCancel();
}

function hveCancel() {
  _hveSelected = null;
  _hveArt = null;
  _hveIframe = null;
  _hveMode = 'visual';
  _veHide();
  document.getElementById('artifact-frame').style.display = '';
}

// ══════════════════════════════════════════════════════════
//  DOCX — Word-style inline editor
// ══════════════════════════════════════════════════════════
function _veBuildDocx(container, data) {
  const area = document.createElement('div');
  area.className = 've-word-area';
  area.id = 've-word-area';

  const page = document.createElement('div');
  page.className = 've-word-page';
  page.id = 've-word-page';
  page.contentEditable = 'true';
  page.spellcheck = true;

  // If we previously saved raw HTML (after a user edit), restore it directly
  if (data._docxHtml) {
    page.innerHTML = data._docxHtml;
  } else {
    // First open: build from JSON structure
    let html = '';

    // Title
    const title = data.title || 'Document Title';
    html += `<h1 style="font-size:28px;font-weight:700;color:#1a1a2e;margin:0 0 4px;line-height:1.2;font-family:Georgia,serif;border-bottom:3px solid #2b579a;padding-bottom:10px">${_veEsc(title)}</h1>`;

    if (data.author) {
      html += `<p style="font-size:12px;color:#888;font-style:italic;margin:4px 0 20px">${_veEsc(data.author)}${data.date ? ' &nbsp;·&nbsp; ' + _veEsc(data.date) : ''}</p>`;
    }

    const sections = data.sections || data.content || data.pages || [];
    for (const sec of sections) {
      const lvl = sec.level || 1;
      const hTag = lvl === 3 ? 'h3' : lvl === 2 ? 'h2' : 'h2';
      const hStyles = lvl === 3
        ? 'font-size:14px;font-weight:700;color:#2d2d3a;margin:20px 0 4px;font-family:Georgia,serif'
        : lvl === 2
        ? 'font-size:17px;font-weight:700;color:#1a1a2e;margin:24px 0 5px;font-family:Georgia,serif'
        : 'font-size:21px;font-weight:700;color:#1a1a2e;margin:28px 0 6px;font-family:Georgia,serif';

      const heading = sec.heading || sec.title || '';
      if (heading) html += `<${hTag} style="${hStyles}">${_veEsc(heading)}</${hTag}>`;

      const bodyTxt = sec.body || sec.text || sec.content || sec.paragraph || '';
      if (bodyTxt) {
        const formatted = _veEsc(bodyTxt).replace(/\n/g, '<br>');
        html += `<p style="font-size:13.5px;color:#2d2d3a;margin:0 0 12px;line-height:1.75">${formatted}</p>`;
      }

      const bullets = sec.bullets || sec.bullet_points || sec.items || sec.list || [];
      if (bullets.length) {
        html += '<ul style="margin:6px 0 14px;padding-left:22px">';
        for (const b of bullets) {
          html += `<li style="font-size:13.5px;color:#2d2d3a;margin:3px 0;line-height:1.65">${_veEsc(String(b))}</li>`;
        }
        html += '</ul>';
      }
    }

    if (data.footer) {
      html += '<hr style="border:none;border-top:1px solid #dde;margin:32px 0 12px">';
      html += `<p style="font-size:11px;color:#888;font-style:italic">${_veEsc(data.footer)}</p>`;
    }

    page.innerHTML = html;
  }

  area.appendChild(page);
  container.appendChild(area);

  // ── Ruler ────────────────────────────────────────────────────────────
  const ruler = document.createElement('div');
  ruler.id = 've-ruler';
  ruler.innerHTML = '<canvas></canvas>';
  container.insertBefore(ruler, area);

  // ── Status bar ───────────────────────────────────────────────────────
  const statusBar = document.createElement('div');
  statusBar.id = 've-page-status';
  container.appendChild(statusBar);

  // Apply current page setup CSS (size, margins, orientation, page numbers)
  _veApplyPageCss();

  page.addEventListener('keyup', veUpdateFmtBar);
  page.addEventListener('mouseup', veUpdateFmtBar);
  document.addEventListener('selectionchange', veUpdateFmtBar);

  // Word-style keyboard: Tab = indent, plus full keyboard shortcut suite
  page.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) { document.execCommand('outdent', false, null); }
      else { document.execCommand('indent', false, null); }
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); document.execCommand('bold',      false, null); veUpdateFmtBar(); break;
        case 'i': e.preventDefault(); document.execCommand('italic',    false, null); veUpdateFmtBar(); break;
        case 'u': e.preventDefault(); document.execCommand('underline', false, null); veUpdateFmtBar(); break;
        case 'e': e.preventDefault(); document.execCommand('justifyCenter', false, null); veSetAlignBtns('center'); break;
        case 'l': e.preventDefault(); document.execCommand('justifyLeft',   false, null); veSetAlignBtns('left');   break;
        case 'r': if (!e.shiftKey) { e.preventDefault(); document.execCommand('justifyRight', false, null); veSetAlignBtns('right'); } break;
        case 'j': e.preventDefault(); document.execCommand('justifyFull', false, null); veSetAlignBtns('justify'); break;
        case 'k': e.preventDefault(); veInsertLink(); break;
        case 'h': e.preventDefault(); veOpenFindReplace(); break;
        case 'm': if (e.shiftKey) { e.preventDefault(); veExecCmd('strikeThrough'); } break;
        case '=': if (e.shiftKey) { e.preventDefault(); veExecCmd('superscript'); } break;
        case '-': if (e.shiftKey) { e.preventDefault(); veExecCmd('subscript'); } break;
        case 'Enter': e.preventDefault(); veInsertPageBreak(); break;
      }
      // Ctrl+Shift+L = bullet list
      if (e.shiftKey && e.key === 'L') { e.preventDefault(); veToggleList('ul'); }
      // Ctrl+Shift+O = numbered list
      if (e.shiftKey && (e.key === 'O' || e.key === 'o')) { e.preventDefault(); veToggleList('ol'); }
    }
  });

  // Update page numbers on any input
  page.addEventListener('input', () => { veUpdatePageNumbers(); });
}

function _veCreateBlock(type, content, placeholder) {
  const el = document.createElement('div');
  el.className = 've-block ve-block-placeholder';
  el.dataset.type = type;
  el.dataset.ph = placeholder || '';
  el.contentEditable = 'true';
  el.spellcheck = true;
  if (content) el.textContent = content;
  el.addEventListener('focus', () => { _veActiveBlock = el; veUpdateFmtBar(); veUpdateParaStyleDropdown(el); });
  el.addEventListener('keydown', veBlockKeydown);
  return el;
}

let _veActiveBlock = null;

function veBlockKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const atEnd = range.collapsed && range.endOffset === (this.textContent || '').length;
    if (atEnd) {
      e.preventDefault();
      const next = _veCreateBlock('p', '', 'Paragraph text…');
      this.parentNode.insertBefore(next, this.nextSibling);
      next.focus();
    }
  }
  if (e.key === 'Backspace' && (this.textContent || '').length === 0) {
    const prev = this.previousElementSibling;
    if (prev && prev.classList.contains('ve-block')) {
      e.preventDefault();
      this.remove();
      prev.focus();
      const r = document.createRange(); r.selectNodeContents(prev); r.collapse(false);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
  }
}

function veExecCmd(cmd) { document.execCommand(cmd, false, null); veUpdateFmtBar(); }

// Save/restore selection so format toolbar doesn't lose focus
let _veSavedSel = null;
function veSaveSelection() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    _veSavedSel = sel.getRangeAt(0).cloneRange();
  }
}
function veRestoreSelection() {
  const page = document.getElementById('ve-word-page');
  if (!page || !_veSavedSel) return;
  // Must focus the contenteditable before restoring selection, otherwise execCommand has no target.
  // We do it synchronously so the range is set before the browser processes the click event.
  page.focus({ preventScroll: true });
  try {
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(_veSavedSel.cloneRange()); }
  } catch(e) {}
}

function veExecFormat(cmd, val) {
  const isAlign = cmd === 'justifyLeft' || cmd === 'justifyCenter' || cmd === 'justifyRight' || cmd === 'justifyFull';
  if (!isAlign) veRestoreSelection();
  if (cmd === 'fontSize') {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      // Wrap selected text in a span with the desired font size
      try {
        const range = sel.getRangeAt(0);
        const span = document.createElement('span');
        span.style.fontSize = parseInt(val) + 'px';
        range.surroundContents(span);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch(e) {
        // surroundContents fails if selection spans multiple elements — use execCommand fallback
        document.execCommand('styleWithCSS', false, true);
        document.execCommand('fontSize', false, '7');
        document.querySelectorAll('.ve-word-page font[size="7"]').forEach(f => {
          const sp2 = document.createElement('span');
          sp2.style.fontSize = parseInt(val) + 'px';
          while (f.firstChild) sp2.appendChild(f.firstChild);
          f.parentNode.replaceChild(sp2, f);
        });
      }
    } else {
      // No selection: apply to the currently focused block
      const blk = _veActiveBlock;
      if (blk) blk.style.fontSize = parseInt(val) + 'px';
    }
  } else if (cmd === 'foreColor' || cmd === 'hiliteColor' || cmd === 'backColor' || cmd === 'fontName') {
    // Use styleWithCSS so these emit inline style spans, not legacy font tags
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(cmd, false, val);
  } else if (isAlign) {
    // Alignment: focus the page first, then restore the saved selection, then execute
    const page = document.getElementById('ve-word-page');
    if (page) page.focus({ preventScroll: true });
    if (_veSavedSel) {
      try {
        const s = window.getSelection();
        if (s) { s.removeAllRanges(); s.addRange(_veSavedSel.cloneRange()); }
      } catch(e) {}
    }
    document.execCommand(cmd, false, null);
  } else {
    document.execCommand(cmd, false, val);
  }
  veUpdateFmtBar();
}

function veSetAlignBtns(align) {
  ['left','center','right','justify'].forEach(a => {
    const btn = document.getElementById('vfb-'+a);
    if (btn) btn.classList.toggle('active', a === align);
  });
}

function veToggleList(kind) { document.execCommand(kind === 'ul' ? 'insertUnorderedList' : 'insertOrderedList', false, null); veUpdateFmtBar(); }

function veInsertTable() {
  const page = document.getElementById('ve-word-page');
  if (!page) return;

  // Build a mini modal instead of prompt() — prompt() loses focus and kills selection
  const existing = document.getElementById('_ve_table_modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = '_ve_table_modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div style="background:#1a2540;border-radius:8px;padding:20px 24px;min-width:260px;color:#e0e6f0;font-family:'DM Sans',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5)">
      <div style="font-weight:700;font-size:14px;margin-bottom:14px;color:#fff">Insert Table</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div><label style="font-size:11px;color:#8899bb">Rows</label><br>
          <input id="_vt_rows" type="number" value="3" min="1" max="30" style="width:100%;padding:5px 8px;background:#0d1b2e;border:1px solid #2a3f6f;border-radius:4px;color:#fff;font-size:13px;box-sizing:border-box;margin-top:3px"></div>
        <div><label style="font-size:11px;color:#8899bb">Columns</label><br>
          <input id="_vt_cols" type="number" value="3" min="1" max="15" style="width:100%;padding:5px 8px;background:#0d1b2e;border:1px solid #2a3f6f;border-radius:4px;color:#fff;font-size:13px;box-sizing:border-box;margin-top:3px"></div>
      </div>
      <label style="font-size:11px;color:#8899bb"><input type="checkbox" id="_vt_header" checked style="margin-right:5px">Include header row</label>
      <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
        <button onclick="document.getElementById('_ve_table_modal').remove()" style="padding:6px 14px;background:#1e3055;border:1px solid #2a4a8a;border-radius:4px;color:#aac;font-size:12px;cursor:pointer">Cancel</button>
        <button id="_vt_ok" style="padding:6px 14px;background:#2b579a;border:none;border-radius:4px;color:#fff;font-size:12px;cursor:pointer;font-weight:700">Insert</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('_vt_rows').focus();

  document.getElementById('_vt_ok').onclick = () => {
    const rows = Math.max(1, Math.min(30, parseInt(document.getElementById('_vt_rows').value) || 3));
    const cols = Math.max(1, Math.min(15, parseInt(document.getElementById('_vt_cols').value) || 3));
    const hasHeader = document.getElementById('_vt_header').checked;
    modal.remove();

    // Directly append to page — more reliable than execCommand insertHTML for tables
    page.focus({ preventScroll: true });

    const table = document.createElement('table');
    table.style.cssText = 'border-collapse:collapse;width:100%;margin:10px 0';
    table.setAttribute('data-ve-table', '1');

    const startRow = hasHeader ? 0 : 1;
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const isHeader = hasHeader && r === 0;
        const cell = document.createElement(isHeader ? 'th' : 'td');
        cell.style.cssText = isHeader
          ? 'border:1px solid #ccc;padding:6px 10px;background:#f0f4f8;font-weight:700;text-align:left;min-width:60px'
          : 'border:1px solid #ccc;padding:6px 10px;min-width:60px';
        cell.contentEditable = 'true';
        cell.textContent = isHeader ? `Header ${c + 1}` : '';
        tr.appendChild(cell);
      }
      table.appendChild(tr);
    }

    // Insert at cursor position or append
    const sel = window.getSelection();
    const savedSel = _veSavedSel;
    let inserted = false;
    if (savedSel && page.contains(savedSel.startContainer)) {
      try {
        sel.removeAllRanges();
        sel.addRange(savedSel.cloneRange());
        const range = sel.getRangeAt(0);
        // Find the block-level ancestor inside page
        let node = range.startContainer;
        while (node && node.parentNode !== page) node = node.parentNode;
        if (node && node.parentNode === page) {
          page.insertBefore(table, node.nextSibling);
          const spacer = document.createElement('p');
          spacer.innerHTML = '<br>';
          page.insertBefore(spacer, table.nextSibling);
          // Move cursor into first cell
          const firstCell = table.querySelector('td, th');
          if (firstCell) { const r2 = document.createRange(); r2.setStart(firstCell,0); r2.collapse(true); sel.removeAllRanges(); sel.addRange(r2); }
          inserted = true;
        }
      } catch(e) {}
    }
    if (!inserted) {
      page.appendChild(table);
      const spacer = document.createElement('p'); spacer.innerHTML = '<br>';
      page.appendChild(spacer);
    }
    veUpdateFmtBar();
    veUpdatePageNumbers();
  };
}

function veInsertImage() {
  // Save selection before opening file picker — the file input click doesn't blur the page
  veSaveSelection();
  document.getElementById('ve-img-input').click();
}

function veHandleImageUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const page = document.getElementById('ve-word-page');
  if (!page) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = document.createElement('img');
    img.src = e.target.result;
    img.alt = file.name;
    img.style.cssText = 'max-width:100%;height:auto;display:block;margin:8px 0;border-radius:4px';
    img.setAttribute('data-ve-img', '1');

    // Add resize handles wrapper
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:inline-block;position:relative;max-width:100%;margin:8px 0';
    wrapper.setAttribute('data-ve-imgwrap', '1');
    wrapper.contentEditable = 'false';
    wrapper.appendChild(img);

    // Try to insert at saved cursor position
    const sel = window.getSelection();
    let inserted = false;
    if (_veSavedSel && page.contains(_veSavedSel.startContainer)) {
      try {
        sel.removeAllRanges();
        sel.addRange(_veSavedSel.cloneRange());
        const range = sel.getRangeAt(0);
        range.collapse(false);
        range.insertNode(wrapper);
        // Move cursor after the image
        const afterRange = document.createRange();
        afterRange.setStartAfter(wrapper);
        afterRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(afterRange);
        inserted = true;
      } catch(err) {}
    }
    if (!inserted) {
      page.appendChild(wrapper);
    }
    // Ensure paragraph after image
    if (!wrapper.nextSibling || wrapper.nextSibling.nodeName === 'BR') {
      const p = document.createElement('p'); p.innerHTML = '<br>';
      wrapper.parentNode.insertBefore(p, wrapper.nextSibling);
    }
    veUpdateFmtBar();
    veUpdatePageNumbers();
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function veInsertLink() {
  const url = prompt('Link URL:', 'https://');
  if (!url || url === 'https://') return;
  const page = document.getElementById('ve-word-page');
  if (page) page.focus({ preventScroll: true });
  if (_veSavedSel) { const s = window.getSelection(); if (s) { s.removeAllRanges(); s.addRange(_veSavedSel.cloneRange()); } }
  const sel = window.getSelection();
  const linkText = (sel && sel.toString().trim()) ? sel.toString() : url;
  if (sel && !sel.isCollapsed) {
    document.execCommand('createLink', false, url);
  } else {
    document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" style="color:#2b579a">${linkText}</a>`);
  }
  veUpdateFmtBar();
}

function veApplyParaStyle(type) {
  if (_veActiveBlock) { _veActiveBlock.dataset.type = type; veUpdateParaStyleDropdown(_veActiveBlock); }
}

function veSetBlockType(type) { if (_veActiveBlock) { _veActiveBlock.dataset.type = type; veUpdateParaStyleDropdown(_veActiveBlock); } }

function veDeleteBlock() {
  if (_veActiveBlock && _veActiveBlock.parentNode) {
    const prev = _veActiveBlock.previousElementSibling;
    _veActiveBlock.remove(); _veActiveBlock = null;
    if (prev && prev.classList.contains('ve-block')) prev.focus();
  }
}

function veUpdateParaStyleDropdown(blk) { const sel = document.getElementById('ve-para-style'); if (sel && blk) sel.value = blk.dataset.type || 'p'; }

function veUpdateFmtBar() {
  try {
    const b  = document.getElementById('vfb-bold'),
          i  = document.getElementById('vfb-italic'),
          u  = document.getElementById('vfb-underline'),
          s  = document.getElementById('vfb-strike');
    if (b) b.classList.toggle('active', document.queryCommandState('bold'));
    if (i) i.classList.toggle('active', document.queryCommandState('italic'));
    if (u) u.classList.toggle('active', document.queryCommandState('underline'));
    if (s) s.classList.toggle('active', document.queryCommandState('strikeThrough'));
    // Alignment detection
    const alignMap = {justifyLeft:'left', justifyCenter:'center', justifyRight:'right', justifyFull:'justify'};
    let activeAlign = 'left';
    for (const [cmd, name] of Object.entries(alignMap)) {
      try { if (document.queryCommandState(cmd)) { activeAlign = name; break; } } catch(e){}
    }
    veSetAlignBtns(activeAlign);
  } catch(e){}
}

// ── PAGE SETUP STATE ─────────────────────────────────────────────────────
const _vePageSetup = {
  size: 'A4', orient: 'portrait', cols: 1, pgnum: 'none',
  mt: 25, mb: 25, ml: 25, mr: 25,
};

// Page dimensions in mm (portrait)
const _vePageSizes = {
  A4:     { w: 210, h: 297 },
  Letter: { w: 216, h: 279 },
  Legal:  { w: 216, h: 356 },
  A3:     { w: 297, h: 420 },
  A5:     { w: 148, h: 210 },
};

function _veApplyPageCss() {
  const page = document.getElementById('ve-word-page');
  if (!page) return;
  const ps   = _vePageSetup;
  const dims = _vePageSizes[ps.size] || _vePageSizes.A4;
  const w    = ps.orient === 'landscape' ? dims.h : dims.w;
  const h    = ps.orient === 'landscape' ? dims.w : dims.h;
  // Convert mm → px at 96dpi (1mm = 3.7795px)
  const MM  = 3.7795;
  const wpx = Math.round(w * MM);
  const minHpx = Math.round(h * MM);
  page.style.width    = wpx + 'px';
  page.style.maxWidth = wpx + 'px';
  page.style.minHeight = minHpx + 'px';
  page.style.paddingTop    = Math.round(ps.mt * MM) + 'px';
  page.style.paddingBottom = Math.round(ps.mb * MM) + 'px';
  page.style.paddingLeft   = Math.round(ps.ml * MM) + 'px';
  page.style.paddingRight  = Math.round(ps.mr * MM) + 'px';
  page.style.columnCount   = ps.cols > 1 ? ps.cols : '';
  page.style.columnGap     = ps.cols > 1 ? '32px' : '';

  // Page number overlays — remove old ones, add new
  page.querySelectorAll('.ve-pg-num').forEach(el => el.remove());
  if (ps.pgnum !== 'none') {
    _veUpdatePageNums();
  }

  // Update ruler
  _veDrawRuler(wpx, Math.round(ps.ml * MM), Math.round(ps.mr * MM));

  // Update status bar
  _veUpdateStatusBar();
}

function _veUpdatePageNums() {
  const page = document.getElementById('ve-word-page');
  if (!page) return;
  page.querySelectorAll('.ve-pg-num').forEach(el => el.remove());
  if (_vePageSetup.pgnum === 'none') return;
  const breaks = Array.from(page.querySelectorAll('.ve-page-break'));
  const total = breaks.length + 1;
  const [vpos, halign] = _vePageSetup.pgnum.split('-');
  const isTop = vpos === 'top';
  const textAlign = halign === 'right' ? 'right' : 'center';

  function makeNum(n) {
    const el = document.createElement('div');
    el.className = 've-pg-num';
    el.textContent = n;
    el.style.cssText = `display:block;text-align:${textAlign};font-size:10px;color:#aaa;` +
      `font-family:'DM Mono',monospace;pointer-events:none;user-select:none;` +
      `margin:${isTop ? '0 0 6px' : '6px 0 0'};width:100%;`;
    return el;
  }

  // Page 1 number
  if (isTop) {
    page.insertBefore(makeNum(1), page.firstChild);
  }

  // Numbers after/before each page break
  breaks.forEach((br, idx) => {
    if (isTop) {
      // Number for the next page goes after the break
      br.after(makeNum(idx + 2));
    } else {
      // Number for the current page goes before the break
      br.before(makeNum(idx + 1));
    }
  });

  // Last page bottom number
  if (!isTop) {
    page.appendChild(makeNum(total));
  }
}

function _veDrawRuler(pageWidthPx, leftPadPx, rightPadPx) {
  const ruler = document.getElementById('ve-ruler');
  if (!ruler) return;
  const area  = document.getElementById('ve-word-area');
  const areaPad = 20; // padding of ve-word-area
  const areaW = area ? area.clientWidth : 800;
  const offset = Math.max(0, (areaW - pageWidthPx) / 2); // page centering offset
  const canvas = ruler.querySelector('canvas') || document.createElement('canvas');
  canvas.width  = areaW;
  canvas.height = 18;
  ruler.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, areaW, 18);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, areaW, 18);
  // Grey out margin zones
  ctx.fillStyle = '#d0d0d0';
  ctx.fillRect(offset, 0, leftPadPx, 18);
  ctx.fillRect(offset + pageWidthPx - rightPadPx, 0, rightPadPx, 18);
  // Tick marks every 10mm = ~37.8px
  const MM = 3.7795;
  ctx.fillStyle = '#888';
  ctx.font = '8px DM Mono, monospace';
  ctx.textAlign = 'center';
  const totalMm = Math.ceil(pageWidthPx / MM);
  for (let mm = 0; mm <= totalMm; mm++) {
    const x = offset + mm * MM;
    const isMajor = mm % 10 === 0;
    const isMid   = mm % 5  === 0;
    const h = isMajor ? 8 : isMid ? 5 : 3;
    ctx.fillRect(x, 18 - h, 1, h);
    if (isMajor && mm > 0) ctx.fillText(mm, x, 8);
  }
}

function _veUpdateStatusBar() {
  const bar = document.getElementById('ve-page-status');
  if (!bar) return;
  const page = document.getElementById('ve-word-page');
  const ps   = _vePageSetup;
  const breaks = page ? page.querySelectorAll('.ve-page-break').length : 0;
  const pages  = breaks + 1;
  const text   = page ? (page.innerText || '') : '';
  const words  = text.trim().split(/\s+/).filter(Boolean).length;
  const size   = ps.orient === 'landscape'
    ? `${_vePageSizes[ps.size]?.h || 210}×${_vePageSizes[ps.size]?.w || 297}mm`
    : `${_vePageSizes[ps.size]?.w || 210}×${_vePageSizes[ps.size]?.h || 297}mm`;
  bar.innerHTML = `<span>📄 ${ps.size} ${ps.orient === 'landscape' ? '(Landscape)' : ''}</span><span>${size}</span><span>Margins: ${ps.mt}/${ps.mb}/${ps.ml}/${ps.mr}mm</span><span>Pages: ${pages}</span><span>Words: ${words}</span>`;
}

function veOpenPageSetup() {
  const modal = document.getElementById('ve-page-setup-modal');
  if (!modal) return;
  const ps = _vePageSetup;
  // Sync modal to current state
  document.getElementById('ve-ps-mt').value = ps.mt;
  document.getElementById('ve-ps-mb').value = ps.mb;
  document.getElementById('ve-ps-ml').value = ps.ml;
  document.getElementById('ve-ps-mr').value = ps.mr;
  // Highlight correct chips
  ['size','orient','pgnum','cols'].forEach(type => {
    modal.querySelectorAll(`.ve-ps-chip[data-${type}]`).forEach(btn => {
      const val = type === 'size' ? ps.size : type === 'orient' ? ps.orient : type === 'pgnum' ? ps.pgnum : String(ps.cols);
      btn.classList.toggle('active', btn.dataset[type] === val || btn.dataset.size === val || btn.dataset.orient === val || btn.dataset.pgnum === val || btn.dataset.cols === val);
    });
  });
  modal.style.display = 'flex';
}

function veClosePageSetup() {
  const modal = document.getElementById('ve-page-setup-modal');
  if (modal) modal.style.display = 'none';
}

function vePageSetupChip(btn, type) {
  const modal = document.getElementById('ve-page-setup-modal');
  if (!modal) return;
  modal.querySelectorAll(`.ve-ps-chip[data-${type}]`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function veApplyPageSetup() {
  const modal = document.getElementById('ve-page-setup-modal');
  if (!modal) return;
  const ps = _vePageSetup;
  const activeSize   = modal.querySelector('.ve-ps-chip[data-size].active');
  const activeOrient = modal.querySelector('.ve-ps-chip[data-orient].active');
  const activePgnum  = modal.querySelector('.ve-ps-chip[data-pgnum].active');
  const activeCols   = modal.querySelector('.ve-ps-chip[data-cols].active');
  if (activeSize)   ps.size   = activeSize.dataset.size;
  if (activeOrient) ps.orient = activeOrient.dataset.orient;
  if (activePgnum)  ps.pgnum  = activePgnum.dataset.pgnum;
  if (activeCols)   ps.cols   = parseInt(activeCols.dataset.cols) || 1;
  ps.mt = parseInt(document.getElementById('ve-ps-mt').value) || 25;
  ps.mb = parseInt(document.getElementById('ve-ps-mb').value) || 25;
  ps.ml = parseInt(document.getElementById('ve-ps-ml').value) || 25;
  ps.mr = parseInt(document.getElementById('ve-ps-mr').value) || 25;
  veClosePageSetup();
  _veApplyPageCss();
  // Sync updated _pageSetup into the artifact's stored code so downloads honour it
  const art = _veArt || _artifacts[_activeArt];
  if (art) {
    try {
      const newCode = _veSerialize();
      art.code = newCode;
      let entry = S.codeStore.get(art.id);
      if (entry) { entry.content = newCode; S.codeStore.set(art.id, entry); }
    } catch(e) {}
  }
  toast(`Page: ${ps.size} ${ps.orient}, margins ${ps.mt}/${ps.mb}/${ps.ml}/${ps.mr}mm ✓`, 'ok');
}

// Page break insertion
function veInsertPageBreak() {
  const html = '<div class="ve-page-break" contenteditable="false" style="position:relative;margin:24px 0;pointer-events:none"><hr style="border:none;border-top:2px dashed #aac4ff;margin:0"><span style="position:absolute;right:0;top:-9px;font-size:10px;color:#aac4ff;background:#fff;padding:0 6px;font-family:\'DM Mono\',monospace;pointer-events:none">— Page Break —</span></div><p><br></p>';
  document.execCommand('insertHTML', false, html);
  veUpdateFmtBar();
  // Recount pages
  veUpdatePageNumbers();
}

// Recount pages based on page breaks
function veUpdatePageNumbers() {
  const page = document.getElementById('ve-word-page');
  if (!page) return;
  const breaks = page.querySelectorAll('.ve-page-break');
  const totalPages = breaks.length + 1;
  // Update label
  const wc = document.getElementById('vfb-wc');
  const text = page.innerText || '';
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  if (wc) wc.title = `Words: ${words} | Chars: ${chars} | Pages: ~${totalPages}`;
  // Number the page break labels
  breaks.forEach((br, idx) => {
    const sp = br.querySelector('span');
    if (sp) sp.textContent = `— Page ${idx + 2} starts —`;
  });
  // Refresh page number overlays and status bar
  _veUpdatePageNums();
  _veUpdateStatusBar();
}

// Word count popup
function veShowWordCount() {
  const page = document.getElementById('ve-word-page');
  if (!page) return;
  const text = page.innerText || '';
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  const breaks = page.querySelectorAll('.ve-page-break').length;
  const pages = breaks + 1;
  toast(`📝 Words: ${words} · Chars: ${chars} · Pages: ~${pages}`, 'ok');
}

// Print document
function vePrint() {
  const page = document.getElementById('ve-word-page');
  if (!page) return;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Document</title><style>
    body{font-family:Georgia,serif;font-size:13.5px;color:#2d2d3a;margin:0;padding:32px 80px;max-width:800px;line-height:1.75}
    h1{font-size:26px;font-weight:700;color:#1a1a2e;border-bottom:3px solid #2b579a;padding-bottom:8px}
    h2{font-size:19px;font-weight:700;color:#1a1a2e;margin-top:24px}
    h3{font-size:15px;font-weight:700;color:#2d2d3a;margin-top:16px}
    table{border-collapse:collapse;width:100%}
    td,th{border:1px solid #ccc;padding:6px 10px}
    th{background:#f0f4f8;font-weight:700}
    .ve-page-break{page-break-after:always;border:none;margin:0}
    @media print{.ve-page-break{page-break-after:always}}
  </style></head><body>${page.innerHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 400);
}

// Find & Replace
let _fnrMatches = [], _fnrIdx = 0;
function veOpenFindReplace() {
  const bar = document.getElementById('ve-fnr-bar');
  if (!bar) return;
  bar.style.display = 'flex';
  bar.style.removeProperty('display');  // ensure flex overrides none
  bar.style.display = 'flex';
  setTimeout(() => { const f = document.getElementById('ve-fnr-find'); if (f) f.focus(); }, 50);
}
function veCloseFindReplace() {
  const bar = document.getElementById('ve-fnr-bar');
  if (bar) bar.style.display = 'none';
  _fnrMatches = []; _fnrIdx = 0;
  // Clear highlights
  const page = document.getElementById('ve-word-page');
  if (page) {
    page.querySelectorAll('.__fnr_hl').forEach(el => {
      const parent = el.parentNode;
      parent.replaceChild(document.createTextNode(el.textContent), el);
      parent.normalize();
    });
  }
  document.getElementById('ve-fnr-count').textContent = '';
}
function _fnrHighlightAll(term) {
  const page = document.getElementById('ve-word-page');
  if (!page || !term) return;
  // Clear old highlights
  page.querySelectorAll('.__fnr_hl').forEach(el => {
    const p = el.parentNode; p.replaceChild(document.createTextNode(el.textContent), el); p.normalize();
  });
  _fnrMatches = [];
  if (!term) return;
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let n;
  while ((n = walker.nextNode())) textNodes.push(n);
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  textNodes.forEach(tn => {
    const parent = tn.parentNode;
    if (!parent || parent.classList?.contains('__fnr_hl')) return;
    const parts = tn.textContent.split(re);
    const matches = tn.textContent.match(re);
    if (!matches) return;
    const frag = document.createDocumentFragment();
    parts.forEach((part, i) => {
      frag.appendChild(document.createTextNode(part));
      if (i < matches.length) {
        const sp = document.createElement('span');
        sp.className = '__fnr_hl';
        sp.style.cssText = 'background:#ffe066;color:#1a1a2e;border-radius:2px';
        sp.textContent = matches[i];
        frag.appendChild(sp);
        _fnrMatches.push(sp);
      }
    });
    parent.replaceChild(frag, tn);
  });
}
function veFnrNext() {
  const term = document.getElementById('ve-fnr-find')?.value || '';
  if (!term) return;
  _fnrHighlightAll(term);
  if (!_fnrMatches.length) { document.getElementById('ve-fnr-count').textContent = '0 found'; return; }
  _fnrMatches.forEach(m => m.style.background = '#ffe066');
  _fnrIdx = (_fnrIdx + 1) % _fnrMatches.length;
  const cur = _fnrMatches[_fnrIdx];
  cur.style.background = '#ff9900';
  cur.scrollIntoView({ block: 'center' });
  document.getElementById('ve-fnr-count').textContent = `${_fnrIdx + 1}/${_fnrMatches.length}`;
}
function veFnrReplace() {
  const term = document.getElementById('ve-fnr-find')?.value || '';
  const rep  = document.getElementById('ve-fnr-replace')?.value ?? '';
  if (!term || !_fnrMatches.length) return;
  const cur = _fnrMatches[_fnrIdx % _fnrMatches.length];
  if (cur) { cur.parentNode.replaceChild(document.createTextNode(rep), cur); }
  _fnrMatches = []; _fnrIdx = 0;
  _fnrHighlightAll(term);
  document.getElementById('ve-fnr-count').textContent = `${_fnrMatches.length} remaining`;
}
function veFnrReplaceAll() {
  const term = document.getElementById('ve-fnr-find')?.value || '';
  const rep  = document.getElementById('ve-fnr-replace')?.value ?? '';
  if (!term) return;
  _fnrHighlightAll(term);
  const count = _fnrMatches.length;
  _fnrMatches.forEach(m => { m.parentNode.replaceChild(document.createTextNode(rep), m); });
  _fnrMatches = []; _fnrIdx = 0;
  document.getElementById('ve-fnr-count').textContent = `${count} replaced`;
  const page = document.getElementById('ve-word-page'); if (page) page.normalize();
}

// ── Serialise DOCX → JSON ──
function _veSerializeDocx() {
  const page = document.getElementById('ve-word-page');
  if (!page) return _veArt ? _veArt.code : '{}';
  // Save raw innerHTML so all inline styles, images, tables, colors are preserved.
  // Also snapshot _vePageSetup so page size/orientation/margins/page-numbers survive download.
  return JSON.stringify({ _docxHtml: page.innerHTML, _pageSetup: { size: _vePageSetup.size, orient: _vePageSetup.orient, mt: _vePageSetup.mt, mb: _vePageSetup.mb, ml: _vePageSetup.ml, mr: _vePageSetup.mr, pgnum: _vePageSetup.pgnum, cols: _vePageSetup.cols } }, null, 2);
}

// ══════════════════════════════════════════════════════════
//  PPTX — PowerPoint-style visual editor
// ══════════════════════════════════════════════════════════
function _veBuildPptx(container, data) {
  _veSlides = (data.slides || data.pages || data.content || []).map((s, i) => ({
    title: s.title || s.heading || '',
    body: s.body || s.subtitle || s.text || '',
    bullets: [...(s.bullets || s.bullet_points || s.points || s.items || [])],
    notes: s.notes || '',
    background: s.background || s.color || s.bg || SLIDE_COLORS[i % SLIDE_COLORS.length],
    transition: s.transition || 'none',
    fontFamily: s.fontFamily || '',
    titleSize: s.titleSize || '',
    titleColor: s.titleColor || '',
    bodyColor: s.bodyColor || '',
    bold: s.bold || false,
    italic: s.italic || false,
    underline: s.underline || false,
    align: s.align || '',
    layout: s.layout || '',
    image: s.image || '',
    divider: s.divider || false,
  }));
  if (_veSlides.length === 0) _veSlides.push({ title:'Slide 1', body:'', bullets:[], notes:'', background: SLIDE_COLORS[0] });
  _veActiveSlidIdx = 0;
  _vePptxHistory = [];

  const shell = document.createElement('div');
  shell.className = 've-ppt-shell';
  shell.id = 've-ppt-shell';

  const main = document.createElement('div');
  main.className = 've-ppt-main';
  main.id = 've-ppt-main';

  const canvas = document.createElement('div');
  canvas.className = 've-slide-canvas';
  canvas.id = 've-slide-canvas';
  main.appendChild(canvas);

  const slideNum = document.createElement('div');
  slideNum.className = 've-ppt-slide-num';
  slideNum.id = 've-ppt-slide-num';
  main.appendChild(slideNum);

  // Notes strip below canvas (background now in toolbar)
  const strip = document.createElement('div');
  strip.className = 've-slide-strip';
  strip.id = 've-slide-strip';
  main.appendChild(strip);

  // Thumbnail panel at the bottom of the shell
  const panel = document.createElement('div');
  panel.className = 've-ppt-panel';
  panel.id = 've-ppt-panel';

  shell.appendChild(main);
  shell.appendChild(panel);
  container.appendChild(shell);

  _veRenderPptxPanel();
  _veRenderSlide(0);
}

function _veRenderPptxPanel() {
  const panel = document.getElementById('ve-ppt-panel');
  if (!panel) return;
  panel.innerHTML = '';
  _veSlides.forEach((sl, i) => {
    const thumb = document.createElement('div');
    thumb.className = 've-ppt-thumb' + (i === _veActiveSlidIdx ? ' active' : '');
    thumb.onclick = () => { _veSaveCurrentSlide(); _veRenderSlide(i); };
    const num = document.createElement('div');
    num.className = 've-ppt-thumb-num';
    num.textContent = i + 1;
    thumb.appendChild(num);
    const inner = document.createElement('div');
    inner.className = 've-ppt-thumb-inner';
    inner.style.background = sl.background || SLIDE_COLORS[i % SLIDE_COLORS.length];
    const tDiv = document.createElement('div');
    tDiv.className = 've-ppt-thumb-title';
    tDiv.textContent = sl.title || '(untitled)';
    const bDiv = document.createElement('div');
    bDiv.className = 've-ppt-thumb-body';
    bDiv.textContent = [sl.body, ...(sl.bullets || [])].filter(Boolean).join(' · ');
    inner.appendChild(tDiv); inner.appendChild(bDiv);
    thumb.appendChild(inner);
    panel.appendChild(thumb);
  });
  const addBtn = document.createElement('div');
  addBtn.className = 've-ppt-add-slide';
  addBtn.innerHTML = '+<br>Slide';
  addBtn.onclick = () => {
    _veSaveCurrentSlide();
    _veSlides.push({ title:'New Slide', body:'', bullets:[], notes:'', background: SLIDE_COLORS[_veSlides.length % SLIDE_COLORS.length] });
    _veRenderPptxPanel();
    _veRenderSlide(_veSlides.length - 1);
  };
  panel.appendChild(addBtn);
}

function _veRenderSlide(idx) {
  _veActiveSlidIdx = idx;
  const sl = _veSlides[idx];
  if (!sl) return;
  const canvas = document.getElementById('ve-slide-canvas');
  if (!canvas) return;
  canvas.innerHTML = '';
  const bg = document.createElement('div');
  bg.className = 've-slide-bg';
  bg.style.background = sl.background;
  canvas.appendChild(bg);
  const content = document.createElement('div');
  content.className = 've-slide-content';

  // Apply stored per-slide styles to _vePptStyle
  _vePptStyle.fontFamily  = sl.fontFamily  || _vePptStyle.fontFamily;
  _vePptStyle.titleSize   = sl.titleSize   || _vePptStyle.titleSize;
  _vePptStyle.bold        = sl.bold        || false;
  _vePptStyle.italic      = sl.italic      || false;
  _vePptStyle.underline   = sl.underline   || false;
  _vePptStyle.align       = sl.align       || 'left';
  _vePptStyle.titleColor  = sl.titleColor  || '#ffffff';
  _vePptStyle.bodyColor   = sl.bodyColor   || 'rgba(255,255,255,.85)';
  _vePptStyle.layout      = sl.layout      || 'title-bullets';
  _vePptStyle.transition  = sl.transition  || 'none';
  _vePptSyncToolbar(sl);

  const layout = sl.layout || 'title-bullets';
  const isBigNumber = layout === 'big-number';
  const isTwoCol    = layout === 'two-col';
  const isBlank     = layout === 'blank';
  const isTitleOnly = layout === 'title-only';

  // Title
  const titleIn = document.createElement('input');
  titleIn.className = 've-slide-title-input';
  titleIn.id = 've-slide-title';
  titleIn.placeholder = isBigNumber ? 'Big number / stat' : 'Slide title';
  titleIn.value = sl.title;
  titleIn.setAttribute('autocomplete','off');
  // Apply stored styles
  titleIn.style.fontFamily     = _vePptStyle.fontFamily;
  titleIn.style.fontSize       = (isBigNumber ? Math.max(_vePptStyle.titleSize, 56) : _vePptStyle.titleSize) + 'px';
  titleIn.style.fontWeight     = _vePptStyle.bold ? '800' : '700';
  titleIn.style.fontStyle      = _vePptStyle.italic ? 'italic' : 'normal';
  titleIn.style.textDecoration = _vePptStyle.underline ? 'underline' : 'none';
  titleIn.style.textAlign      = _vePptStyle.align;
  titleIn.style.color          = _vePptStyle.titleColor;
  titleIn.addEventListener('input', () => { sl.title = titleIn.value; _vePptxPushHistory(); _veRenderPptxPanel(); });
  if (!isBlank) content.appendChild(titleIn);

  // Divider accent line
  if (sl.divider || isBigNumber) {
    const divLine = document.createElement('div');
    divLine.style.cssText = 'height:3px;width:60px;border-radius:2px;background:rgba(255,255,255,.4);margin:8px 0 10px';
    if (_vePptStyle.align === 'center') divLine.style.margin = '8px auto 10px';
    if (_vePptStyle.align === 'right')  divLine.style.marginLeft = 'auto';
    content.appendChild(divLine);
  }

  // Body
  const bodyIn = document.createElement('textarea');
  bodyIn.className = 've-slide-body-input';
  bodyIn.id = 've-slide-body';
  bodyIn.placeholder = isBigNumber ? 'Label / description' : 'Body text / subtitle';
  bodyIn.value = sl.body;
  bodyIn.rows = isTitleOnly || isBigNumber ? 1 : 2;
  bodyIn.style.textAlign = _vePptStyle.align;
  bodyIn.style.color     = _vePptStyle.bodyColor;
  bodyIn.style.fontFamily = _vePptStyle.fontFamily;
  bodyIn.addEventListener('input', () => { sl.body = bodyIn.value; bodyIn.style.height='auto'; bodyIn.style.height=bodyIn.scrollHeight+'px'; _vePptxPushHistory(); });
  if (!isBlank) content.appendChild(bodyIn);

  // Image (if set)
  if (sl.image) {
    const imgWrap = document.createElement('div');
    imgWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px';
    const img = document.createElement('img');
    img.src = sl.image;
    img.style.cssText = 'max-height:120px;max-width:45%;object-fit:contain;border-radius:4px;cursor:pointer';
    img.title = 'Click to change image URL';
    img.onclick = () => { const u = prompt('New image URL:', sl.image); if (u) { sl.image = u; img.src = u; _vePptxPushHistory(); }};
    const rmImg = document.createElement('button');
    rmImg.className = 've-slide-bullet-del';
    rmImg.textContent = '×';
    rmImg.title = 'Remove image';
    rmImg.onclick = () => { delete sl.image; _vePptxPushHistory(); _veRenderSlide(_veActiveSlidIdx); };
    imgWrap.appendChild(img); imgWrap.appendChild(rmImg);
    content.appendChild(imgWrap);
  }

  // Inline bullets
  const bulletsWrap = document.createElement('div');
  bulletsWrap.className = 've-slide-bullets';
  bulletsWrap.id = 've-slide-bullets';

  const renderBullets = () => {
    bulletsWrap.innerHTML = '';
    sl.bullets.forEach((b, bi) => {
      const row = document.createElement('div');
      row.className = 've-slide-bullet-item';
      const dot = document.createElement('div');
      dot.className = 've-slide-bullet-dot';
      const inp = document.createElement('input');
      inp.className = 've-slide-bullet-input';
      inp.value = b;
      inp.placeholder = 'Bullet point ' + (bi + 1);
      inp.addEventListener('input', () => { sl.bullets[bi] = inp.value; _vePptxPushHistory(); });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sl.bullets.splice(bi + 1, 0, '');
          _vePptxPushHistory();
          renderBullets();
          const inputs = bulletsWrap.querySelectorAll('.ve-slide-bullet-input');
          if (inputs[bi + 1]) inputs[bi + 1].focus();
        }
        if (e.key === 'Backspace' && inp.value === '') {
          e.preventDefault();
          if (sl.bullets.length > 1 || b !== '') {
            sl.bullets.splice(bi, 1);
            _vePptxPushHistory();
            renderBullets();
            const inputs = bulletsWrap.querySelectorAll('.ve-slide-bullet-input');
            const focusIdx = Math.max(0, bi - 1);
            if (inputs[focusIdx]) inputs[focusIdx].focus();
          }
        }
      });
      const del = document.createElement('button');
      del.className = 've-slide-bullet-del';
      del.textContent = '×';
      del.title = 'Remove bullet';
      del.onclick = () => { sl.bullets.splice(bi, 1); _vePptxPushHistory(); renderBullets(); };
      row.appendChild(dot); row.appendChild(inp); row.appendChild(del);
      bulletsWrap.appendChild(row);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 've-slide-add-bullet';
    addBtn.textContent = '+ Add bullet';
    addBtn.onclick = () => {
      sl.bullets.push('');
      _vePptxPushHistory();
      renderBullets();
      setTimeout(() => {
        const inputs = bulletsWrap.querySelectorAll('.ve-slide-bullet-input');
        if (inputs.length) inputs[inputs.length - 1].focus();
      }, 30);
    };
    bulletsWrap.appendChild(addBtn);
  };
  renderBullets();
  content.appendChild(bulletsWrap);
  canvas.appendChild(content);

  // Bottom strip: Notes + Background + Delete
  _veRenderSlideStrip(idx, sl);

  const sn = document.getElementById('ve-ppt-slide-num');
  if (sn) sn.textContent = 'Slide ' + (idx + 1) + ' of ' + _veSlides.length;
  document.querySelectorAll('.ve-ppt-thumb').forEach((t, i) => t.classList.toggle('active', i === idx));
  setTimeout(() => { bodyIn.style.height='auto'; bodyIn.style.height=bodyIn.scrollHeight+'px'; }, 0);
}

function _veRenderSlideStrip(idx, sl) {
  const strip = document.getElementById('ve-slide-strip');
  if (!strip) return;
  strip.innerHTML = '';

  // Notes section
  const notesSec = document.createElement('div');
  notesSec.className = 've-strip-section';
  const notesLbl = document.createElement('div');
  notesLbl.className = 've-strip-label';
  notesLbl.textContent = '🗒 Speaker Notes';
  const notesTA = document.createElement('textarea');
  notesTA.className = 've-strip-notes';
  notesTA.value = sl.notes;
  notesTA.placeholder = 'Add speaker notes…';
  notesTA.rows = 2;
  notesTA.addEventListener('input', () => { sl.notes = notesTA.value; _vePptxPushHistory(); });
  notesSec.appendChild(notesLbl); notesSec.appendChild(notesTA);
  strip.appendChild(notesSec);

  // Delete section (only if >1 slides)
  if (_veSlides.length > 1) {
    const delSec = document.createElement('div');
    delSec.className = 've-strip-section';
    delSec.style.flex = '0 0 auto';
    delSec.style.justifyContent = 'center';
    const delBtn = document.createElement('button');
    delBtn.className = 've-strip-del-btn';
    delBtn.textContent = '× Delete Slide';
    delBtn.onclick = () => {
      _vePptxPushHistory();
      _veSlides.splice(idx, 1);
      _veRenderPptxPanel();
      _veRenderSlide(Math.min(idx, _veSlides.length - 1));
    };
    delSec.appendChild(delBtn);
    strip.appendChild(delSec);
  }

  // Update toolbar background swatches for this slide
  _vePptRenderBgToolbar(sl);
}

function _vePptRenderBgToolbar(sl) {
  const container = document.getElementById('ve-ppt-bg-toolbar');
  const custInput = document.getElementById('ve-ppt-bg-custom-input');
  const custBtn = document.getElementById('ve-ppt-bg-custom-btn');
  if (!container) return;
  container.innerHTML = '';
  SLIDE_COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 've-swatch' + (c === sl.background ? ' active' : '');
    sw.style.background = c; sw.title = c;
    sw.onclick = () => {
      sl.background = c;
      _vePptxPushHistory();
      const bgEl = document.querySelector('.ve-slide-bg');
      if (bgEl) bgEl.style.background = c;
      _veRenderPptxPanel();
      container.querySelectorAll('.ve-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      _veAutoFlush();
    };
    container.appendChild(sw);
  });
  if (custBtn) {
    custBtn.onclick = () => custInput?.click();
  }
  if (custInput) {
    custInput.value = sl.background?.startsWith('#') ? sl.background : '#4c3fcf';
  }
}

function vePptSetBgFromToolbar(color) {
  const sl = _veSlides[_veActiveSlidIdx];
  if (!sl) return;
  sl.background = color;
  _vePptxPushHistory();
  const bgEl = document.querySelector('.ve-slide-bg');
  if (bgEl) bgEl.style.background = color;
  _veRenderPptxPanel();
  _vePptRenderBgToolbar(sl);
  _veAutoFlush();
}

// _veRenderSlideProps removed — replaced by inline bullets + _veRenderSlideStrip


// ── PPTX slide formatting helpers ──
let _vePptStyle = {
  fontFamily: "'Syne',sans-serif", titleSize: 36,
  bold: false, italic: false, underline: false,
  align: 'left', titleColor: '#ffffff', bodyColor: '#ffffffcc',
  layout: 'title-bullets', transition: 'none'
};

function vePptSetFont(f) {
  _vePptStyle.fontFamily = f;
  const sl = _veSlides[_veActiveSlidIdx];
  if (sl) { sl.fontFamily = f; _vePptxPushHistory(); }
  const ti = document.getElementById('ve-slide-title');
  if (ti) ti.style.fontFamily = f;
  document.querySelectorAll('.ve-slide-bullet-input,.ve-slide-body-input').forEach(el => el.style.fontFamily = f);
  _veAutoFlush();
}

function vePptSetSize(s) {
  const size = parseInt(s) || 36;
  _vePptStyle.titleSize = size;
  const sl = _veSlides[_veActiveSlidIdx];
  if (sl) { sl.titleSize = size; _vePptxPushHistory(); }
  const ti = document.getElementById('ve-slide-title');
  if (ti) ti.style.fontSize = size + 'px';
  // Also scale body and bullets proportionally
  const bodyIn = document.getElementById('ve-slide-body');
  if (bodyIn) bodyIn.style.fontSize = Math.max(10, Math.round(size * 0.45)) + 'px';
  document.querySelectorAll('.ve-slide-bullet-input').forEach(el => {
    el.style.fontSize = Math.max(10, Math.round(size * 0.5)) + 'px';
  });
  _veAutoFlush();
}

// Auto-flush _veSlides into art.code so the preview and download always reflect current state
function _veAutoFlush() {
  const art = _veArt || _artifacts[_activeArt];
  if (!art || !['pptx','pptx-content'].includes(art.lang)) return;
  const newCode = _veSerializePptx();
  art.code = newCode;
  // Rebuild the in-panel preview HTML from the serialised data
  try {
    const data = JSON.parse(newCode);
    art._previewHtml = buildPptxPreviewHtml(data);
  } catch(e) {}
}

function vePptToggle(prop) {
  _vePptStyle[prop] = !_vePptStyle[prop];
  document.getElementById('vp-' + prop)?.classList.toggle('active', _vePptStyle[prop]);
  const sl = _veSlides[_veActiveSlidIdx];
  if (sl) { sl[prop] = _vePptStyle[prop]; _vePptxPushHistory(); }
  const ti = document.getElementById('ve-slide-title');
  if (!ti) return;
  if (prop === 'bold')      ti.style.fontWeight     = _vePptStyle.bold      ? '800'   : '700';
  if (prop === 'italic')    ti.style.fontStyle      = _vePptStyle.italic    ? 'italic': 'normal';
  if (prop === 'underline') ti.style.textDecoration = _vePptStyle.underline ? 'underline' : 'none';
  _veAutoFlush();
}

function vePptAlign(a) {
  _vePptStyle.align = a;
  ['left','center','right'].forEach(x => document.getElementById('vp-'+x)?.classList.toggle('active', x === a));
  const sl = _veSlides[_veActiveSlidIdx];
  if (sl) { sl.align = a; _vePptxPushHistory(); }
  document.getElementById('ve-slide-title')?.style && (document.getElementById('ve-slide-title').style.textAlign = a);
  document.getElementById('ve-slide-body')?.style  && (document.getElementById('ve-slide-body').style.textAlign = a);
  document.querySelectorAll('.ve-slide-bullet-input').forEach(el => el.style.textAlign = a);
  _veAutoFlush();
}

function vePptSetColor(c, target) {
  const sl = _veSlides[_veActiveSlidIdx];
  if (target === 'title') {
    _vePptStyle.titleColor = c;
    if (sl) sl.titleColor = c;
    const ti = document.getElementById('ve-slide-title');
    if (ti) ti.style.color = c;
  } else {
    _vePptStyle.bodyColor = c;
    if (sl) sl.bodyColor = c;
    const bi = document.getElementById('ve-slide-body');
    if (bi) bi.style.color = c;
    document.querySelectorAll('.ve-slide-bullet-input').forEach(el => el.style.color = c);
  }
  if (sl) _vePptxPushHistory();
  _veAutoFlush();
}

function vePptSetLayout(layout) {
  _vePptStyle.layout = layout;
  const sl = _veSlides[_veActiveSlidIdx];
  if (sl) { sl.layout = layout; _vePptxPushHistory(); }
  _veRenderSlide(_veActiveSlidIdx);
  _veAutoFlush();
}

function vePptSetTransition(t) {
  _vePptStyle.transition = t;
  // Apply to ALL slides so transitions work throughout the presentation
  _veSlides.forEach(sl => { if (sl) sl.transition = t; });
  _vePptxPushHistory();
  _veAutoFlush();
  toast('Transition: ' + t, 'ok');
}

function vePptDuplicateSlide() {
  const sl = _veSlides[_veActiveSlidIdx];
  if (!sl) return;
  _vePptxPushHistory();
  const clone = JSON.parse(JSON.stringify(sl));
  _veSlides.splice(_veActiveSlidIdx + 1, 0, clone);
  _veRenderPptxPanel();
  _veRenderSlide(_veActiveSlidIdx + 1);
  toast('Slide duplicated', 'ok');
}

function vePptMoveSlide(dir) {
  const idx = _veActiveSlidIdx;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= _veSlides.length) return;
  _vePptxPushHistory();
  const tmp = _veSlides[idx];
  _veSlides[idx] = _veSlides[newIdx];
  _veSlides[newIdx] = tmp;
  _veRenderPptxPanel();
  _veRenderSlide(newIdx);
}

function vePptInsertImage() {
  const url = prompt('Image URL (or leave blank to use a placeholder):');
  const sl = _veSlides[_veActiveSlidIdx];
  if (!sl) return;
  _vePptxPushHistory();
  sl.image = url || 'https://placehold.co/400x200/334/aaa?text=Image';
  _veRenderSlide(_veActiveSlidIdx);
  toast('Image added to slide', 'ok');
}

function vePptInsertShape() {
  const sl = _veSlides[_veActiveSlidIdx];
  if (!sl) return;
  _vePptxPushHistory();
  sl.divider = true;
  _veRenderSlide(_veActiveSlidIdx);
}

function vePptPresent() {
  // Build a full-screen slideshow overlay
  const existing = document.getElementById('ppt-present-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ppt-present-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer';

  // Inject transition CSS
  const transStyle = document.createElement('style');
  transStyle.textContent = `
    @keyframes ppt-fade-in{from{opacity:0}to{opacity:1}}
    @keyframes ppt-slide-in-right{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}
    @keyframes ppt-slide-in-left{from{transform:translateX(-60px);opacity:0}to{transform:translateX(0);opacity:1}}
    @keyframes ppt-zoom-in{from{transform:scale(.88);opacity:0}to{transform:scale(1);opacity:1}}
    .ppt-anim-fade{animation:ppt-fade-in .38s cubic-bezier(.4,0,.2,1) both}
    .ppt-anim-slide-right{animation:ppt-slide-in-right .35s cubic-bezier(.4,0,.2,1) both}
    .ppt-anim-slide-left{animation:ppt-slide-in-left .35s cubic-bezier(.4,0,.2,1) both}
    .ppt-anim-zoom{animation:ppt-zoom-in .38s cubic-bezier(.4,0,.2,1) both}
  `;
  overlay.appendChild(transStyle);

  let pIdx = _veActiveSlidIdx;
  let _lastDir = 1; // 1 = forward, -1 = backward

  const renderPresSlide = (dir) => {
    // Remove old slide (keep controls)
    const oldSlide = overlay.querySelector('.ppt-slide-el');
    if (oldSlide) oldSlide.remove();
    // Also remove old notes bar
    const oldNotes = overlay.querySelector('.ppt-notes-bar');
    if (oldNotes) oldNotes.remove();

    const sl = _veSlides[pIdx];
    if (!sl) return;

    // Determine transition animation class
    let animClass = '';
    const trans = sl.transition || _vePptStyle.transition || 'none';
    if (trans === 'fade') animClass = 'ppt-anim-fade';
    else if (trans === 'slide') animClass = dir >= 0 ? 'ppt-anim-slide-right' : 'ppt-anim-slide-left';
    else if (trans === 'zoom') animClass = 'ppt-anim-zoom';

    // Counter
    let ctr = overlay.querySelector('.ppt-ctr');
    if (!ctr) { ctr = document.createElement('div'); ctr.className = 'ppt-ctr'; ctr.style.cssText = 'position:absolute;top:16px;right:20px;color:rgba(255,255,255,.4);font-size:13px;font-family:"DM Sans",sans-serif;z-index:2'; overlay.appendChild(ctr); }
    ctr.textContent = (pIdx + 1) + ' / ' + _veSlides.length;

    // Exit
    if (!overlay.querySelector('.ppt-exit')) {
      const exitBtn = document.createElement('button');
      exitBtn.className = 'ppt-exit';
      exitBtn.style.cssText = 'position:absolute;top:14px;left:18px;background:none;border:none;color:rgba(255,255,255,.5);font-size:22px;cursor:pointer;padding:4px;z-index:2';
      exitBtn.textContent = '✕';
      exitBtn.onclick = (e) => { e.stopPropagation(); overlay.remove(); document.removeEventListener('keydown', keyHandler); };
      overlay.appendChild(exitBtn);
    }

    // Slide — append without animation class first so browser can paint it, then trigger anim via rAF
    const slide = document.createElement('div');
    slide.className = 'ppt-slide-el';
    slide.style.cssText = `width:min(90vw,1280px);aspect-ratio:16/9;background:${sl.background || '#2b579a'};border-radius:6px;display:flex;flex-direction:column;justify-content:center;padding:8% 10%;box-sizing:border-box;position:relative;overflow:hidden`;

    const h1 = document.createElement('div');
    h1.style.cssText = `font-size:clamp(28px,5vw,72px);font-weight:800;color:${sl.titleColor||'#fff'};font-family:${sl.fontFamily||"'Syne',sans-serif"};line-height:1.1;margin-bottom:4%;text-align:${sl.align||'left'}`;
    h1.textContent = sl.title || '';
    slide.appendChild(h1);

    if (sl.body) {
      const body = document.createElement('div');
      body.style.cssText = `font-size:clamp(14px,2.2vw,28px);color:${sl.bodyColor||'rgba(255,255,255,.85)'};font-family:${sl.fontFamily||"'DM Sans',sans-serif"};margin-bottom:3%;line-height:1.5;text-align:${sl.align||'left'}`;
      body.textContent = sl.body;
      slide.appendChild(body);
    }

    if (sl.bullets?.length) {
      const ul = document.createElement('ul');
      ul.style.cssText = 'list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:1.5%';
      sl.bullets.forEach(b => {
        const li = document.createElement('li');
        li.style.cssText = `font-size:clamp(12px,1.8vw,24px);color:${sl.bodyColor||'rgba(255,255,255,.85)'};display:flex;align-items:center;gap:10px`;
        li.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;opacity:.7"></span>${b}`;
        ul.appendChild(li);
      });
      slide.appendChild(ul);
    }

    if (sl.image) {
      const img = document.createElement('img');
      img.src = sl.image;
      img.style.cssText = 'max-width:45%;max-height:55%;object-fit:contain;position:absolute;bottom:8%;right:8%;border-radius:4px';
      slide.appendChild(img);
    }

    overlay.appendChild(slide);
    // Trigger CSS keyframe animation AFTER browser paints the element
    if (animClass) {
      requestAnimationFrame(() => requestAnimationFrame(() => slide.classList.add(animClass)));
    }

    // Nav arrows — re-render to update visibility
    overlay.querySelectorAll('.ppt-nav').forEach(el => el.remove());
    if (pIdx > 0) {
      const prev = document.createElement('button');
      prev.className = 'ppt-nav';
      prev.style.cssText = 'position:absolute;left:16px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.1);border:none;color:#fff;font-size:28px;border-radius:50%;width:48px;height:48px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2';
      prev.innerHTML = '‹';
      prev.onclick = (e) => { e.stopPropagation(); pIdx--; renderPresSlide(-1); };
      overlay.appendChild(prev);
    }
    if (pIdx < _veSlides.length - 1) {
      const next = document.createElement('button');
      next.className = 'ppt-nav';
      next.style.cssText = 'position:absolute;right:16px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.1);border:none;color:#fff;font-size:28px;border-radius:50%;width:48px;height:48px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2';
      next.innerHTML = '›';
      next.onclick = (e) => { e.stopPropagation(); pIdx++; renderPresSlide(1); };
      overlay.appendChild(next);
    }

    // Notes bar
    if (sl.notes) {
      const nb = document.createElement('div');
      nb.className = 'ppt-notes-bar';
      nb.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.7);padding:8px 20px;color:rgba(255,255,255,.6);font-size:clamp(10px,1.2vw,13px);font-family:"DM Sans",sans-serif;border-top:1px solid rgba(255,255,255,.1);z-index:2';
      nb.textContent = '📝 ' + sl.notes;
      overlay.appendChild(nb);
    }
  };

  // Keyboard nav
  const keyHandler = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { if (pIdx < _veSlides.length - 1) { pIdx++; renderPresSlide(1); } }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')                    { if (pIdx > 0)                    { pIdx--; renderPresSlide(-1); } }
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', keyHandler); }
  };
  document.addEventListener('keydown', keyHandler);

  renderPresSlide(1);
  document.body.appendChild(overlay);
}

// Sync toolbar controls to current slide state
function _vePptSyncToolbar(sl) {
  if (!sl) return;
  const fSel = document.getElementById('ve-ppt-font');
  if (fSel && sl.fontFamily) fSel.value = sl.fontFamily;
  const sSel = document.getElementById('ve-ppt-size');
  if (sSel && sl.titleSize) sSel.value = sl.titleSize;
  const lSel = document.getElementById('ve-ppt-layout');
  if (lSel && sl.layout) lSel.value = sl.layout;
  const tSel = document.getElementById('ve-ppt-transition');
  if (tSel && sl.transition) tSel.value = sl.transition;
  ['bold','italic','underline'].forEach(p => document.getElementById('vp-'+p)?.classList.toggle('active', !!sl[p]));
  ['left','center','right'].forEach(a => document.getElementById('vp-'+a)?.classList.toggle('active', (sl.align||'left') === a));
}

// ── PPTX History (undo stack) ──
let _vePptxHistory = [];
const _VE_PPTX_MAX_HISTORY = 50;

function _vePptxPushHistory() {
  _vePptxHistory.push(JSON.parse(JSON.stringify(_veSlides)));
  if (_vePptxHistory.length > _VE_PPTX_MAX_HISTORY) _vePptxHistory.shift();
}

function veUndo() {
  if (_veFmt === 'pptx') {
    if (_vePptxHistory.length === 0) { toast('Nothing to undo', 'er'); return; }
    _veSlides = _vePptxHistory.pop();
    _veRenderPptxPanel();
    _veRenderSlide(Math.min(_veActiveSlidIdx, _veSlides.length - 1));
    toast('Undone ✓', 'ok');
  } else {
    // DOCX uses contentEditable — browser undo works natively
    document.execCommand('undo', false, null);
  }
}

function _veSaveCurrentSlide() {
  const sl = _veSlides[_veActiveSlidIdx];
  if (!sl) return;
  const titleIn = document.getElementById('ve-slide-title');
  const bodyIn  = document.getElementById('ve-slide-body');
  if (titleIn) sl.title = titleIn.value;
  if (bodyIn)  sl.body  = bodyIn.value;
}

// ── Serialise PPTX → JSON ──
function _veSerializePptx() {
  _veSaveCurrentSlide();
  return JSON.stringify({
    title: _veSlides[0]?.title || 'Presentation',
    slides: _veSlides.map(s => {
      const obj = { title: s.title || '' };
      if (s.body) obj.body = s.body;
      if (s.bullets && s.bullets.length) obj.bullets = s.bullets.filter(Boolean);
      if (s.notes) obj.notes = s.notes;
      obj.background = s.background || SLIDE_COLORS[0];
      // Always serialize transition so loading back gives exact per-slide value (Bug 7)
      obj.transition = s.transition || 'none';
      // Per-slide formatting properties (Bug 4)
      if (s.fontFamily) obj.fontFamily = s.fontFamily;
      if (s.titleSize) obj.titleSize = s.titleSize;
      if (s.titleColor) obj.titleColor = s.titleColor;
      if (s.bodyColor) obj.bodyColor = s.bodyColor;
      if (s.bold) obj.bold = s.bold;
      if (s.italic) obj.italic = s.italic;
      if (s.underline) obj.underline = s.underline;
      if (s.align) obj.align = s.align;
      if (s.layout) obj.layout = s.layout;
      if (s.image) obj.image = s.image;
      if (s.divider) obj.divider = s.divider;
      return obj;
    })
  }, null, 2);
}

function _veSerialize() { return _veFmt === 'pptx' ? _veSerializePptx() : _veSerializeDocx(); }

function cancelVisualEdit() { if (_hveArt) { hveCancel(); return; } _veHide(); }

function applyVisualEdit() {
  if (_hveArt) { hveApply(); return; }
  const art = _veArt || _artifacts[_activeArt];
  if (!art) return;
  const newCode = _veSerialize();
  const oldCode = art.code;
  art.code = newCode;

  // Upsert codeStore — always update/create so model context reflects visual edits
  let entry = S.codeStore.get(art.id);
  if (!entry) {
    entry = { lang: art.lang || 'json', content: newCode, srcMsgIdx: undefined };
    S.codeStore.set(art.id, entry);
  } else {
    entry.content = newCode;
    S.codeStore.set(art.id, entry);
    const blk = document.getElementById(art.id);
    if (blk) {
      blk.dataset.raw = btoa(unescape(encodeURIComponent(newCode)));
      const pre = blk.querySelector('pre');
      if (pre) pre.innerHTML = buildLineTable(highlightCode(esc(newCode), entry.lang));
    }
    if (entry.srcMsgIdx !== undefined) {
      const srcMsg = S.msgs[entry.srcMsgIdx];
      if (srcMsg && typeof srcMsg.content === 'string') srcMsg.content = srcMsg.content.replace(oldCode, newCode);
    }
  }

  const chat = S.convs.find(c => c.id === S.chatId);
  if (chat) { chat.codeStore = Array.from(S.codeStore.entries()); chat.msgs = S.msgs; }
  persist();

  _veHide();

  // Rebuild preview HTML and refresh the iframe
  try {
    if (_veFmt === 'pptx') {
      const data = parseModelJSON(newCode);
      const html = buildPptxPreviewHtml(data);
      art._previewHtml = html;
      const frame = document.getElementById('artifact-frame');
      if (frame) frame.srcdoc = _wrapArtHtml(html);
    } else {
      // For docx, newCode contains {_docxHtml: ...} — use it directly as the preview
      const data = parseModelJSON(newCode);
      const innerHtml = data._docxHtml || '';
      const previewHtml = buildDocxPreviewHtml(data);
      // If we have raw HTML from the editor, wrap it in the docx preview shell using page setup settings
      const html = innerHtml
        ? buildDocxEditorPreviewHtml(innerHtml)
        : previewHtml;
      art._previewHtml = html;
      const frame = document.getElementById('artifact-frame');
      if (frame) frame.srcdoc = _wrapArtHtml(html);
    }
  } catch(e) {
    previewDocBlock(art.id, _veFmt === 'pptx' ? 'pptx' : 'docx');
  }

  toast('Changes applied ✓', 'ok');
}


// ── Original applyArtEdit (for code/HTML/text artifacts) ──
function applyArtEdit() {
  const art = _artifacts[_activeArt];
  if (!art) return;
  const newCode = document.getElementById('artifact-edit-area').value;
  const oldCode = art.code;
  art.code = newCode;

  // Upsert codeStore — create entry if missing so model always sees latest version
  let entry = S.codeStore.get(art.id);
  if (!entry) {
    // No existing entry — create one so model context is updated
    entry = { lang: art.lang || 'text', content: newCode, srcMsgIdx: undefined };
    S.codeStore.set(art.id, entry);
  } else {
    entry.content = newCode;
    S.codeStore.set(art.id, entry);
    // Update DOM block
    const blk = document.getElementById(art.id);
    if (blk) {
      const newRawB64 = btoa(unescape(encodeURIComponent(newCode)));
      blk.dataset.raw = newRawB64;
      const pre = blk.querySelector('pre');
      if (pre) pre.innerHTML = buildLineTable(highlightCode(esc(newCode), entry.lang));
    }
    // Update source message for persistence
    if (entry.srcMsgIdx !== undefined) {
      const srcMsg = S.msgs[entry.srcMsgIdx];
      if (srcMsg && typeof srcMsg.content === 'string' && srcMsg.content.includes(oldCode.slice(0, 60))) {
        srcMsg.content = srcMsg.content.replace(oldCode, newCode);
      }
    }
  }

  // Save per-conv codeStore
  const chat = S.convs.find(c => c.id === S.chatId);
  if (chat) { chat.codeStore = Array.from(S.codeStore.entries()); chat.msgs = S.msgs; }
  persist();

  cancelArtEdit();
  loadArtFrame(art);
  toast('Edit applied and saved to context', 'ok');
}

// Render a rich HTML preview of a doc/pptx/pdf JSON block
function previewDocBlock(id, fmt) {
  const blk = document.getElementById(id);
  if (!blk) return;
  const raw = blk.dataset.raw ? decodeURIComponent(escape(atob(blk.dataset.raw))) : blk.querySelector('pre')?.innerText || '';
  let data;
  try { data = parseModelJSON(raw); } catch(e) { toast('Preview failed: invalid JSON — ' + e.message, 'er'); return; }

  let html = '';
  if (fmt === 'docx') html = buildDocxPreviewHtml(data);
  else if (fmt === 'pptx') html = buildPptxPreviewHtml(data);
  else if (fmt === 'pdf') html = buildPdfPreviewHtml(data);

  const existing = _artifacts.findIndex(a => a.id === id);
  const art = { id, lang: fmt, code: raw, title: esc2(data.title || data.fileName || fmt.toUpperCase()), _previewHtml: html };
  if (existing >= 0) {
    const prevDriveLink = _artifacts[existing].driveLink;
    _artifacts[existing] = art;
    if (prevDriveLink) _artifacts[existing].driveLink = prevDriveLink;
    activateArtifact(existing);
  }
  else { _artifacts.push(art); activateArtifact(_artifacts.length - 1); }
}

// Build a preview HTML using the current page setup settings (margins, size, orientation, page numbers)
function buildDocxEditorPreviewHtml(innerHtml) {
  const ps   = _vePageSetup;
  const dims = _vePageSizes[ps.size] || _vePageSizes.A4;
  const w    = ps.orient === 'landscape' ? dims.h : dims.w;
  const h    = ps.orient === 'landscape' ? dims.w : dims.h;
  const MM   = 3.7795;
  const wpx  = Math.round(w * MM);
  const minH = Math.round(h * MM);
  const pt   = Math.round(ps.mt * MM);
  const pb   = Math.round(ps.mb * MM);
  const pl   = Math.round(ps.ml * MM);
  const pr   = Math.round(ps.mr * MM);
  const cols = ps.cols > 1 ? `column-count:${ps.cols};column-gap:32px;` : '';

  // Build page-number CSS
  let pnCSS = '';
  let pnHtml = '';
  if (ps.pgnum !== 'none') {
    const [vpos, halign] = ps.pgnum.split('-');
    const align = halign === 'right' ? 'right' : 'center';
    const isTop = vpos === 'top';
    pnCSS = `
      @page { ${isTop ? `margin-top:${pt+20}px` : `margin-bottom:${pb+20}px`} }
      .pg-num-bar {
        text-align:${align};font-size:10px;color:#999;font-family:'DM Mono',monospace;
        padding:${isTop ? '0 0 8px' : '8px 0 0'};
        position:${isTop ? 'sticky;top:0' : 'static'};
      }`;
    pnHtml = `<div class="pg-num-bar">1</div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:Georgia,'Times New Roman',serif;background:#d0d0d0;padding:20px 0;margin:0}
    .page{background:#fff;width:${wpx}px;max-width:${wpx}px;margin:0 auto;
      padding:${pt}px ${pr}px ${pb}px ${pl}px;
      box-shadow:0 2px 12px rgba(0,0,0,.25);min-height:${minH}px;
      box-sizing:border-box;${cols}}
    table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 10px}
    th{background:#f0f4f8;font-weight:700}
    img{max-width:100%;height:auto}a{color:#2b579a}
    .ve-page-break{page-break-after:always;border-top:2px dashed #aac4ff;margin:24px 0}
    ${pnCSS}
  </style></head><body>
  <div class="page">
    ${ps.pgnum !== 'none' && ps.pgnum.startsWith('top') ? pnHtml : ''}
    ${innerHtml}
    ${ps.pgnum !== 'none' && ps.pgnum.startsWith('bottom') ? pnHtml : ''}
  </div></body></html>`;
}

function buildDocxPreviewHtml(data) {
  // If raw HTML was saved from the visual editor, use it directly with page settings
  if (data._docxHtml) {
    return buildDocxEditorPreviewHtml(data._docxHtml);
  }
  const title = esc2(data.title || 'Document');
  // Support both 'sections' and 'content' as the array key; each item may use
  // 'heading'/'title', 'body'/'text'/'content', 'bullet_points'/'bullets'/'items'
  const sections = data.sections || data.content || data.pages || [];
  let body = '';
  for (const sec of sections) {
    const headingText = sec.heading || sec.title || sec.header || '';
    const bodyText    = sec.body || sec.text || sec.content || sec.paragraph || '';
    const bullets     = sec.bullet_points || sec.bullets || sec.items || sec.list || [];
    const level       = sec.level || (sec.type === 'subheading' ? 2 : 1);

    if (headingText) {
      body += `<h${level} style="margin:${level===1?'28px':'18px'} 0 8px;font-weight:700;color:#1a1a2e;line-height:1.3;font-family:Georgia,serif">${esc2(headingText)}</h${level}>`;
    }
    if (bodyText) {
      // Split on double newline so multi-paragraph body renders properly
      for (const para of String(bodyText).split(/\n\n+/)) {
        if (para.trim()) body += `<p style="margin:0 0 12px;line-height:1.75;color:#2d2d3a;font-size:14px">${esc2(para.trim())}</p>`;
      }
    }
    if (Array.isArray(bullets) && bullets.length) {
      body += `<ul style="margin:4px 0 14px 20px;line-height:1.7">`;
      for (const bp of bullets) body += `<li style="margin:4px 0;color:#2d2d3a;font-size:14px">${esc2(String(bp))}</li>`;
      body += `</ul>`;
    }
    if (Array.isArray(sec.rows)) {
      body += `<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:13px">`;
      for (const [ri, row] of sec.rows.entries()) {
        body += '<tr>';
        for (const cell of (Array.isArray(row) ? row : Object.values(row))) {
          const tag = ri === 0 ? 'th' : 'td';
          body += `<${tag} style="border:1px solid #dde;padding:8px 12px;${ri===0?'background:#f0f0fa;font-weight:600':''}">${esc2(String(cell))}</${tag}>`;
        }
        body += '</tr>';
      }
      body += '</table>';
    }
  }
  const footer = data.footer ? `<div style="margin-top:40px;padding-top:12px;border-top:1px solid #dde;font-size:11px;color:#888;text-align:center">${esc2(data.footer)}</div>` : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>*{box-sizing:border-box}body{margin:0;background:#e8e8f0;font-family:Georgia,serif;min-height:100vh;padding:30px 20px}
  .page{max-width:700px;margin:0 auto;background:#fff;padding:60px 72px;box-shadow:0 4px 24px rgba(0,0,0,.12);min-height:900px;border-radius:2px}
  h1{font-size:22px}h2{font-size:17px}h3{font-size:15px}</style></head>
  <body><div class="page">
    <h1 style="margin:0 0 6px;font-size:26px;color:#1a1a2e;font-weight:700">${title}</h1>
    ${data.author ? `<p style="color:#888;font-style:italic;margin:0 0 4px;font-size:13px">${esc2(data.author)}</p>` : ''}
    <hr style="border:none;border-top:2px solid #6a6aff;margin:14px 0 24px">
    ${body}${footer}
  </div></body></html>`;
}

function buildPptxPreviewHtml(data) {
  // Support 'slides' or 'pages' as array key
  const slides = data.slides || data.pages || data.content || [];
  if (!slides.length) return `<html><body style="color:#fff;background:#1a1a2e;padding:40px;font-family:sans-serif;text-align:center"><p style="opacity:.6">No slides found in JSON</p></body></html>`;
  const colors = ['#4c3fcf','#1a6fb3','#b85c1a','#1a7a44','#a0201e','#6b2c99','#1e6b7a','#7a4f1a'];
  let slidesHtml = slides.map((slide, i) => {
    const bg = slide.background || slide.color || slide.bg || colors[i % colors.length];
    const titleTxt  = esc2(slide.title || slide.heading || `Slide ${i + 1}`);
    const bodyTxt   = slide.body || slide.subtitle || slide.text || '';
    // Support bullets / bullet_points / points / items / content (as array)
    const rawPoints = slide.bullets || slide.bullet_points || slide.points || slide.items ||
                      (Array.isArray(slide.content) ? slide.content : null) || [];
    const pointsHtml = Array.isArray(rawPoints) && rawPoints.length
      ? `<ul style="margin:12px 0 0 18px;padding:0;font-size:15px;color:rgba(255,255,255,.92);line-height:1.6">
          ${rawPoints.map(p => `<li style="margin:5px 0">${esc2(String(p))}</li>`).join('')}
        </ul>`
      : '';
    const bodyHtml = bodyTxt ? `<p style="margin:10px 0 0;font-size:16px;color:rgba(255,255,255,.82);line-height:1.5">${esc2(String(bodyTxt))}</p>` : '';
    const noteHtml = slide.notes ? `<div style="margin-top:12px;font-size:11px;color:rgba(255,255,255,.45);font-style:italic">🗒 ${esc2(slide.notes)}</div>` : '';
    return `<div style="background:${bg};min-height:380px;display:flex;flex-direction:column;justify-content:center;padding:44px 52px;border-radius:10px;margin:0 0 18px;box-shadow:0 4px 24px rgba(0,0,0,.3)">
      <div style="font-size:10px;font-weight:700;opacity:.5;letter-spacing:1.5px;margin-bottom:10px;font-family:sans-serif;text-transform:uppercase;color:#fff">Slide ${i + 1}</div>
      <h2 style="margin:0;font-size:26px;font-weight:700;color:#fff;line-height:1.2;font-family:'Syne',sans-serif">${titleTxt}</h2>
      ${bodyHtml}${pointsHtml}${noteHtml}
    </div>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700&display=swap" rel="stylesheet">
  <style>*{box-sizing:border-box}body{margin:0;background:#111118;padding:28px 18px;min-height:100vh}.deck{max-width:740px;margin:0 auto}</style>
  </head><body><div class="deck">
    <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:20px;opacity:.7;font-family:sans-serif">${esc2(data.title || 'Presentation')}</div>
    ${slidesHtml}
  </div></body></html>`;
}

function buildPdfPreviewHtml(data) {
  return buildDocxPreviewHtml(data);
}

// XSS-safe escaper for preview HTML (used inside generated preview iframes)
function esc2(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Support Tab key in artifact editor (inserts 2 spaces)
document.addEventListener('DOMContentLoaded', () => {
  const ta = document.getElementById('artifact-edit-area');
  if (ta) {
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart, end = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = s + 2;
      }
    });
  }
});

function closeArtifact() {
  document.getElementById('artifact-panel').classList.remove('open');
  document.getElementById('app').classList.remove('art-open');
  document.getElementById('main').classList.remove('art-open');
  document.getElementById('main').style.marginRight = '';
}

function _updateArtDriveBtn() {
  const btn = document.getElementById('art-drive-btn');
  if (btn) btn.style.display = _gTokenValid() ? '' : 'none';
}

function openArtNewTab() {
  const art = _artifacts[_activeArt];
  if (!art) return;
  const blob = new Blob([art.code], { type: 'text/html' });
  window.open(URL.createObjectURL(blob), '_blank');
}

function dlArtifact() {
  const art = _artifacts[_activeArt];
  if (!art) return;

  const titleEl = document.getElementById('artifact-title');
  const rawTitle = (titleEl?.textContent || '').trim().replace(/^preview\s*/i, '').trim();
  const safeName = (rawTitle && rawTitle.length > 2)
    ? rawTitle.toLowerCase().replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
    : 'atlas-file';

  // Structured binary types: generate the real file instead of saving raw JSON
  if (['pptx','pptx-content'].includes(art.lang)) { generatePPTX(art.code, safeName + '.pptx'); return; }
  if (['docx','docx-content'].includes(art.lang)) { generateDOCX(art.code, safeName + '.docx'); return; }
  if (['pdf','pdf-content'].includes(art.lang))   { generatePDF(art.code, safeName + '.pdf'); return; }

  // Plain code/text/HTML: direct blob download
  const extMap = {
    html:'html', svg:'svg', jsx:'jsx', js:'js', javascript:'js',
    css:'css', ts:'ts', typescript:'ts', json:'json', xml:'xml',
    csv:'csv', md:'md', markdown:'md', sh:'sh', bash:'sh',
    py:'py', python:'py', c:'c', cpp:'cpp', java:'java',
    go:'go', rust:'rs', rb:'rb', ruby:'rb', php:'php',
    r:'r', swift:'swift', kotlin:'kt', kt:'kt', cs:'cs',
  };
  const ext = extMap[art.lang] || art.lang || 'txt';
  const mimeMap = { css:'text/css', html:'text/html', js:'text/javascript', ts:'text/typescript', json:'application/json', svg:'image/svg+xml', xml:'application/xml', csv:'text/csv', sh:'text/x-sh', py:'text/x-python', md:'text/markdown' };
  const mime = mimeMap[ext] || 'text/plain';
  const fn = extractFilename(art.code, ext) || (safeName + '.' + ext);
  const blob = new Blob([art.code], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = fn; a.click();
  URL.revokeObjectURL(url);
  toast('Downloaded ' + fn, 'ok');
}

// ── DRIVE UPLOAD ─────────────────────────────────────────────────────────
async function uploadArtToDrive() {
  const art = _artifacts[_activeArt];
  if (!art) return;
  if (!_gTokenValid()) { toast('Connect Google account first (Settings → Google)', 'er'); return; }

  const titleEl = document.getElementById('artifact-title');
  const rawTitle = (titleEl?.textContent || '').trim().replace(/^preview\s*/i, '').trim();

  // Determine filename and mime type
  const extMap = {
    html:'html', svg:'svg', jsx:'jsx', js:'js', javascript:'js',
    css:'css', ts:'ts', json:'json', xml:'xml', csv:'csv',
    md:'md', markdown:'md', sh:'sh', py:'py', python:'py',
    pptx:'pptx', docx:'docx', pdf:'pdf',
  };
  const ext = extMap[art.lang] || art.lang || 'txt';
  const baseName = rawTitle && rawTitle.length > 2
    ? rawTitle.replace(/[^\w\s.-]/g,'').trim().slice(0, 50)
    : ('atlas-file-' + Date.now());
  const fileName = baseName + '.' + ext;

  toast('Preparing upload…', 'ok');

  try {
    let fileBlob;
    // For structured doc types, generate real binary
    if (['pptx','pptx-content'].includes(art.lang)) {
      await loadScript('https://unpkg.com/pptxgenjs@3.12.0/dist/pptxgen.bundle.js');
      const data = parseModelJSON(art.code);
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';
      const THEME = { bg:'0e0e18', accent:'7c6aff', text:'e6e6f0', sub:'8888aa', head:'b06aff' };
      for (let i = 0; i < (data.slides||[]).length; i++) {
        const sd = data.slides[i];
        const slide = pptx.addSlide();
        slide.background = { color: THEME.bg };
        const fontFace    = sd.fontFamily ? sd.fontFamily.replace(/['"]/g,'').split(',')[0].trim() : 'Calibri';
        const titleSz     = sd.titleSize  ? parseInt(sd.titleSize) : (i === 0 ? 36 : 28);
        const titleClr    = sd.titleColor ? sd.titleColor.replace('#','') : (i === 0 ? THEME.head : THEME.text);
        const bodyClr     = sd.bodyColor  ? sd.bodyColor.replace('#','')  : THEME.sub;
        const align       = sd.align === 'center' ? 'center' : sd.align === 'right' ? 'right' : 'left';
        try {
          const trans = sd.transition || 'none';
          if (trans === 'fade')  slide.transition = { type:'fade', dur:1000 };
          else if (trans === 'slide') slide.transition = { type:'push', dir:'l', dur:800 };
          else if (trans === 'zoom')  slide.transition = { type:'zoom', dir:'in', dur:900 };
        } catch(_) {}
        slide.addShape(pptx.ShapeType.rect, { x:0,y:0,w:'100%',h:0.08, fill:{color:THEME.accent} });
        slide.addText(sd.title||'', { x:0.5,y:0.2,w:'90%',h:1.0, fontSize:titleSz, bold:sd.bold||false, italic:sd.italic||false, underline:sd.underline||false, color:titleClr, fontFace, align });
        if (sd.body) slide.addText(sd.body, { x:0.5,y:i===0?1.5:1.3,w:'90%',h:0.6, fontSize:16,color:bodyClr,fontFace,align });
        if (sd.bullets?.length) { const objs=sd.bullets.map(b=>({text:b,options:{bullet:{type:'bullet'},color:bodyClr,fontSize:18,fontFace,breakLine:true,align}})); slide.addText(objs,{x:0.6,y:sd.body?2.2:1.5,w:'88%',h:3.5,color:bodyClr}); }
        if (sd.notes) slide.addNotes(sd.notes);
      }
      fileBlob = new Blob([await pptx.write('arraybuffer')], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    } else if (['docx','docx-content'].includes(art.lang)) {
      await loadScript('https://unpkg.com/docx@8.2.2/build/index.umd.js');
      // Re-use the full generateDOCX logic by calling it and capturing the blob
      // We do this by temporarily overriding the click trigger
      let _capturedBlob = null;
      const _origCreate = document.createElement.bind(document);
      document._ceOverride = true;
      const _patchedCreate = function(tag) {
        const el = _origCreate(tag);
        if (tag === 'a') {
          const origClick = el.click.bind(el);
          el.click = function() {
            // Intercept: fetch the blob from href instead of downloading
            fetch(el.href).then(r => r.blob()).then(b => { _capturedBlob = b; });
          };
        }
        return el;
      };
      // Simpler: just replicate the full conversion inline using the shared helper
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
              Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun,
              UnderlineType, ShadingType } = window.docx;
      const data2 = parseModelJSON(art.code);
      const ch2 = [];
      if (data2._docxHtml) {
        const tmp2 = document.createElement('div');
        tmp2.innerHTML = data2._docxHtml;
        tmp2.querySelectorAll('.ve-page-break').forEach(el => el.remove());
        // Use same nodeToChildren logic — call generateDOCX which handles _docxHtml
        // Since generateDOCX now handles this correctly, just get the blob from it
        const blobP = new Promise(resolve => {
          const origToast = window.toast;
          // Temporarily patch to capture the blob URL
          const origCreateElement = document.createElement.bind(document);
          let intercepted = false;
          const _ic = function(tag) {
            const el2 = origCreateElement(tag);
            if (tag === 'a' && !intercepted) {
              intercepted = true;
              el2.click = function() { fetch(el2.href).then(r=>r.blob()).then(resolve).catch(()=>resolve(null)); };
            }
            return el2;
          };
          document.createElement = _ic;
          generateDOCX(art.code, fileName).finally(() => { document.createElement = origCreateElement; });
        });
        fileBlob = await blobP;
        if (!fileBlob) throw new Error('DOCX blob capture failed');
      } else {
        ch2.push(new Paragraph({ text: data2.title||'Document', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing:{after:300} }));
        for (const sec of (data2.sections||[])) {
          if (sec.heading) ch2.push(new Paragraph({ text:sec.heading, heading:HeadingLevel.HEADING_1, spacing:{before:300,after:120} }));
          if (sec.body)    ch2.push(new Paragraph({ children:[new TextRun({text:sec.body,size:24})], spacing:{after:160} }));
          if (sec.bullet_points?.length) sec.bullet_points.forEach(bp=>ch2.push(new Paragraph({children:[new TextRun({text:bp,size:24})],bullet:{level:0},spacing:{after:80}})));
        }
        const docObj = new Document({ sections:[{children:ch2}] });
        fileBlob = await Packer.toBlob(docObj);
      }
    } else {
      // Plain text / code / html etc
      const mimeMap = { html:'text/html', svg:'image/svg+xml', js:'text/javascript', ts:'text/typescript', json:'application/json', css:'text/css', py:'text/x-python', md:'text/markdown', csv:'text/csv' };
      const mime = mimeMap[ext] || 'text/plain';
      fileBlob = new Blob([art.code], { type: mime });
    }

    // Upload via Drive multipart API
    const metadata = { name: fileName };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', fileBlob);

    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + S.google.accessToken },
      body: form,
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error?.message || 'Upload failed');

    // Show success with link
    const link = result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`;
    toast(`☁ Uploaded to Drive: ${result.name}`, 'ok');
    // Persist the Drive link on the artifact so it survives tab switches
    _artifacts[_activeArt].driveLink = link;
    // Show a small inline link in the artifact header — remove stale one first
    const existingLink = document.getElementById('art-drive-link');
    if (existingLink) existingLink.remove();
    const driveLink = document.createElement('a');
    driveLink.id = 'art-drive-link';
    driveLink.href = link;
    driveLink.target = '_blank';
    driveLink.rel = 'noopener noreferrer';
    driveLink.textContent = '☁ View in Drive →';
    driveLink.style.cssText = 'font-size:11px;color:var(--acc);text-decoration:none;padding:3px 8px;background:var(--agl);border-radius:4px;border:1px solid var(--acc2);display:inline-flex;align-items:center;white-space:nowrap;flex-shrink:0';
    // Insert into artifact-hdr, just before the Close button
    const artHdr = document.getElementById('artifact-hdr');
    if (artHdr) {
      const closeBtn = artHdr.querySelector('.art-btn.close');
      if (closeBtn) artHdr.insertBefore(driveLink, closeBtn);
      else artHdr.appendChild(driveLink);
    }
    // Also append link into chat as a persistent message so the user can always find it
    const chatArea = document.getElementById('chat-area');
    if (chatArea) {
      const linkMsg = document.createElement('div');
      linkMsg.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 14px;margin:4px 12px;background:var(--grnd);border:1px solid rgba(45,212,160,.25);border-radius:var(--rs);font-size:12px;color:var(--grn)';
      linkMsg.innerHTML = `☁ <strong>${result.name}</strong> uploaded to Drive — <a href="${link}" target="_blank" rel="noopener" style="color:var(--acc);text-decoration:underline;margin-left:4px">Open in Drive →</a>`;
      chatArea.appendChild(linkMsg);
      chatArea.scrollTop = chatArea.scrollHeight;
    }
  } catch(e) {
    toast('Drive upload failed: ' + e.message, 'er');
    console.error('Drive upload error:', e);
  }
}

// ── CONTEXT BAR ───────────────────────────────────────────────────────────
function countTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function updateCtxBar() {
  if (!S.model) {
    document.getElementById('ctx-label').textContent = 'No model';
    document.getElementById('ctx-fill').style.width = '0%';
    return;
  }
  const ctx = getModelContext();
  const sp = document.getElementById('sys-input')?.value || '';
  const spTok = countTokens(sp);
  const histTok = S.msgs.reduce((sum, m) => sum + countTokens(m.content), 0);
  const inputTok = countTokens(document.getElementById('user-input')?.value || '');
  const outputTok = getModelMaxOutput();
  const total = spTok + histTok + inputTok + outputTok;
  const pct = Math.min((total / ctx) * 100, 100);

  const fill = document.getElementById('ctx-fill');
  const label = document.getElementById('ctx-label');
  fill.style.width = pct.toFixed(1) + '%';

  const cls = pct > 90 ? 'danger' : pct > 70 ? 'warn' : '';
  fill.className = cls;
  label.className = cls;

  const fmtK = n => n >= 1000 ? (n/1000).toFixed(1)+'K' : n;
  label.textContent = `${fmtK(total - outputTok)} / ${fmtK(ctx)} ctx`;

  const tipRow = document.getElementById('ctx-tip-row');
  if (tipRow) {
    tipRow.innerHTML = [
      ['System prompt', spTok + ' tok'],
      ['History', histTok + ' tok'],
      ['Input', inputTok + ' tok'],
      ['Max output', outputTok + ' tok'],
      ['─────', '─────'],
      ['Total', total + ' / ' + ctx + ' tok'],
      ['Used', pct.toFixed(1) + '%'],
    ].map(([l,v]) => `<div class="ctx-tip-item"><span class="ctx-tip-lbl">${l}</span><span class="ctx-tip-val">${v}</span></div>`).join('');
  }
}

let _ctxTipOpen = false;
function toggleCtxTip() {
  _ctxTipOpen = !_ctxTipOpen;
  document.getElementById('ctx-tip').classList.toggle('show', _ctxTipOpen);
}
document.addEventListener('click', e => {
  if (!document.getElementById('ctx-track')?.contains(e.target)) {
    _ctxTipOpen = false;
    document.getElementById('ctx-tip')?.classList.remove('show');
  }
});

function getModelContext() {
  if (!S.model) return 8192;
  return S.model.context_length || 8192;
}

function getModelMaxOutput() {
  if (!S.model) return 4096;
  const providerMax = S.model.top_provider?.max_completion_tokens;
  const perReqMax = S.model.per_request_limits?.output;
  const userSet = S.cfg.maxTok || 4096;
  const modelMax = providerMax || perReqMax || userSet;
  return Math.min(userSet, modelMax);
}

// ── KATEX MATH ────────────────────────────────────────────────────────────
let _katexReady = false;
function loadKatex() {
  if (_katexReady || document.getElementById('katex-css')) return;
  const link = document.createElement('link');
  link.id = 'katex-css';
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
  document.head.appendChild(link);
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
  script.onload = () => { _katexReady = true; renderAllMath(); };
  document.head.appendChild(script);
}

function renderMathIn(el) {
  if (!_katexReady || !el) return;
  el.querySelectorAll('.math-block-placeholder').forEach(ph => {
    try {
      const tex = decodeURIComponent(ph.dataset.tex || '');
      const rendered = document.createElement('div');
      rendered.className = 'math-block';
      window.katex.render(tex, rendered, { displayMode: true, throwOnError: false });
      ph.replaceWith(rendered);
    } catch(e) {}
  });
  el.querySelectorAll('.math-inline-placeholder').forEach(ph => {
    try {
      const tex = decodeURIComponent(ph.dataset.tex || '');
      const span = document.createElement('span');
      span.className = 'math-inline';
      window.katex.render(tex, span, { displayMode: false, throwOnError: false });
      ph.replaceWith(span);
    } catch(e) {}
  });
}

function renderAllMath() {
  document.querySelectorAll('#chat-area .md-body').forEach(renderMathIn);
}

// ── LOCAL FILE DETECTION ──────────────────────────────────────────────────
function showOriginBanner() {
  const b = document.getElementById('origin-banner');
  if (b) b.style.display = 'flex';
}

// ── THEME ─────────────────────────────────────────────────────────────────
function setTheme(t) {
  document.body.classList.toggle('light', t === 'light');
  S.theme = t;
  persist();
  const dark = document.getElementById('theme-dark-btn');
  const light = document.getElementById('theme-light-btn');
  if (dark && light) {
    if (t === 'dark') {
      dark.style.background = 'var(--acc)'; dark.style.color = '#fff'; dark.style.borderColor = 'var(--acc2)';
      light.style.background = 'var(--hov)'; light.style.color = 'var(--tx2)'; light.style.borderColor = 'var(--bdr)';
    } else {
      light.style.background = 'var(--acc)'; light.style.color = '#fff'; light.style.borderColor = 'var(--acc2)';
      dark.style.background = 'var(--hov)'; dark.style.color = 'var(--tx2)'; dark.style.borderColor = 'var(--bdr)';
    }
  }
}

// ── FONT ──────────────────────────────────────────────────────────────────
const FONT_IMPORTS = {
  'Inter': 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap',
  'Geist': 'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500&display=swap',
  'Fira Code': 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&display=swap',
  'JetBrains Mono': 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap',
  'Source Serif 4': 'https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@300;400;600&display=swap',
  'Lora': 'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&display=swap',
  'Nunito': 'https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;500&display=swap',
  'Syne': null, // already loaded
};
function applyFont(family, size) {
  // Load font if needed
  if (family && FONT_IMPORTS[family] && !document.getElementById('font-import-' + family.replace(/\s/g,'_'))) {
    const link = document.createElement('link');
    link.id = 'font-import-' + family.replace(/\s/g,'_');
    link.rel = 'stylesheet'; link.href = FONT_IMPORTS[family];
    document.head.appendChild(link);
  }
  const f = family || 'DM Sans';
  document.body.style.fontFamily = `'${f}', sans-serif`;
  document.documentElement.style.fontFamily = `'${f}', sans-serif`;
  if (size) {
    // Use previewFontSize to apply full element scaling (not just html/body)
    previewFontSize(size);
  }
  // Also update CSS custom prop used by inputs/textareas
  document.documentElement.style.setProperty('--ui-font', `'${f}', sans-serif`);
}
function previewFont(family) { applyFont(family, S.cfg.fontSize || 14); }
function previewFontSize(size) {
  const sz = parseInt(size) || 14;
  let fsSt = document.getElementById('_fontsize_style');
  if (!fsSt) { fsSt = document.createElement('style'); fsSt.id = '_fontsize_style'; document.head.appendChild(fsSt); }
  // Scale all main text elements. clamp() in CSS ignores html/body font-size so we override explicitly.
  // Base size is 14px. Scale all elements proportionally.
  const scale = sz / 14;
  fsSt.textContent = `
    html, body { font-size: ${sz}px !important; }
    .msg-bubble { font-size: ${Math.round(sz * 1.07)}px !important; }
    .md-body p, .md-body li, .md-body td { font-size: ${sz}px !important; }
    .md-body h1 { font-size: ${Math.round(sz * 1.43)}px !important; }
    .md-body h2 { font-size: ${Math.round(sz * 1.21)}px !important; }
    .md-body h3 { font-size: ${Math.round(sz * 1.07)}px !important; }
    #user-input { font-size: ${sz}px !important; }
    .m-name { font-size: ${Math.round(sz * 0.93)}px !important; }
    .ci .ctitle { font-size: ${Math.round(sz * 0.93)}px !important; }
    .code-blk pre, .ln-code { font-size: ${Math.round(sz * 0.86)}px !important; }
    .logo { font-size: ${Math.round(sz * 1.43)}px !important; }
    .settings-row-label { font-size: ${sz}px !important; }
    .modal-label { font-size: ${Math.round(sz * 0.86)}px !important; }
  `;
}
const _DENSITY_STYLES = [
  // compact
  { msgPad:'2px 10px', bubblePad:'6px 11px', chatPad:'4px 0' },
  // normal
  { msgPad:'4px 12px', bubblePad:'9px 14px', chatPad:'10px 0' },
  // spacious
  { msgPad:'8px 14px', bubblePad:'12px 18px', chatPad:'20px 0' },
];
function previewChatDensity(val) {
  const d = _DENSITY_STYLES[val] || _DENSITY_STYLES[1];
  const style = document.getElementById('_density_style') || (() => {
    const s = document.createElement('style'); s.id = '_density_style'; document.head.appendChild(s); return s;
  })();
  style.textContent = `.msg-row{padding:${d.msgPad}!important} .msg-bubble{padding:${d.bubblePad}!important} #chat-area{padding:${d.chatPad}!important}`;
  S.cfg.chatDensity = parseInt(val);
}
const _tokCache = new Map();
let _tokDebounce = null;
let _lastTokText = '';
let _lastTokModel = '';

async function fetchRealTokens(text, modelId) {
  if (!modelId || !text) return null;
  const cacheKey = modelId + '::' + text.slice(0, 200);
  if (_tokCache.has(cacheKey)) return _tokCache.get(cacheKey);
  // OpenRouter does not expose a public /v1/tokenize endpoint.
  // Use the same character-based heuristic (÷4) applied consistently
  // throughout the rest of the codebase.
  const count = Math.ceil(text.length / 4);
  _tokCache.set(cacheKey, count);
  return count;
}

function scheduleTokenUpdate() {
  clearTimeout(_tokDebounce);
  _tokDebounce = setTimeout(async () => {
    const text = document.getElementById('user-input')?.value || '';
    const modelId = S.model?.id;
    if (!text || !modelId || !S.key) return;
    if (text === _lastTokText && modelId === _lastTokModel) return;
    _lastTokText = text; _lastTokModel = modelId;

    const count = await fetchRealTokens(text, modelId);
    if (count != null) {
      const ip = parseFloat(S.model?.pricing?.prompt || 0);
      document.getElementById('tok-est').textContent = '~' + count + ' tokens (estimated)';
      document.getElementById('tok-est').style.opacity = '1';
      if (ip > 0) {
        document.getElementById('cost-est').textContent = '~$' + (count * ip).toFixed(6) + ' input';
        document.getElementById('cost-est').style.opacity = '1';
      }
      updateCtxBarWithRealInput(count);
    }
  }, 600);
}

function updateCtxBarWithRealInput(realInputTok) {
  if (!S.model) return;
  const ctx = getModelContext();
  const sp = document.getElementById('sys-input')?.value || '';
  const spTok = Math.ceil(sp.length / 4);
  const histTok = S.msgs.reduce((sum, m) => sum + Math.ceil((m.content||'').length / 4), 0);
  const outputTok = getModelMaxOutput();
  const total = spTok + histTok + realInputTok + outputTok;
  const pct = Math.min((total / ctx) * 100, 100);

  const fill = document.getElementById('ctx-fill');
  const label = document.getElementById('ctx-label');
  fill.style.width = pct.toFixed(1) + '%';
  const cls = pct > 90 ? 'danger' : pct > 70 ? 'warn' : '';
  fill.className = cls;
  label.className = cls;
  const fmtK = n => n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n);
  label.textContent = fmtK(total - outputTok) + ' / ' + fmtK(ctx) + ' ctx';

  const tipRow = document.getElementById('ctx-tip-row');
  if (tipRow) {
    tipRow.innerHTML = [
      ['System prompt', spTok + ' (est)'],
      ['History', histTok + ' (est)'],
      ['Input', realInputTok + ' (est)'],
      ['Max output', outputTok + ' tok'],
      ['Context window', fmtK(ctx) + ' tok'],
      ['─────────', '──────'],
      ['Used', pct.toFixed(1) + '%'],
    ].map(([l,v]) => '<div class="ctx-tip-item"><span class="ctx-tip-lbl">'+l+'</span><span class="ctx-tip-val">'+v+'</span></div>').join('');
  }
}

// ── ACCOUNT ERROR MODAL ───────────────────────────────────────────────────
let acctModalShown = false;
function showAccountError() {
  if (acctModalShown) return;
  acctModalShown = true;
  const hint = document.getElementById('acct-key-hint');
  if (hint && S.key) hint.textContent = S.key.slice(0, 14) + '…';
  document.getElementById('acct-modal').classList.add('open');
}
function closeAcctModal() {
  document.getElementById('acct-modal').classList.remove('open');
  acctModalShown = false;
}

// ── DEBUG (unchanged) ─────────────────────────────────────────────────────
const _dbgLogs = [];
function toggleDbg(){ document.getElementById('dbg-panel').classList.toggle('open'); }
function clearDbg(){
  _dbgLogs.length = 0;
  document.getElementById('dbg-log').innerHTML = '<div style="color:#4e4e6a;padding:6px 0">Cleared.</div>';
  document.getElementById('dbg-status').textContent = 'Idle';
  document.getElementById('dbg-status').className = '';
}
function dbgLog(label, data){
  const ts = new Date().toLocaleTimeString('en',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const typeMap = {REQUEST:'req',RESPONSE:'res',ERROR:'err',INFO:'inf',CHUNK:'chk','HTTP ERROR BODY':'err','HTTP STATUS':'res'};
  const t = typeMap[label] || 'inf';
  _dbgLogs.push({ts,label,t,data});
  const log = document.getElementById('dbg-log');
  if(!log) return;
  const ds = typeof data === 'object' ? JSON.stringify(data,null,2) : String(data);
  const div = document.createElement('div');
  div.className = 'dbg-entry';
  div.innerHTML = '<span class="dbg-ts">['+ts+']</span><span class="dbg-lbl '+t+'">'+label+'</span><div class="dbg-data">'+esc(ds)+'</div>';
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  const st = document.getElementById('dbg-status');
  if(t==='err'){st.textContent='Error';st.className='er';}
  else if(t==='res'){st.textContent='OK';st.className='ok';}
  else{st.textContent=label;st.className='';}
}
async function testConn(){
  if (S.provider === 'gemini') {
    if (!S.geminiKey) { dbgLog('ERROR','No Gemini API key set.'); return; }
    dbgLog('INFO','Testing Gemini key via GET /v1beta/models...');
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(S.geminiKey)}&pageSize=5`);
      const d = await r.json();
      if (!r.ok) { dbgLog('ERROR',{status:r.status,body:d}); return; }
      dbgLog('RESPONSE',{status:r.status,modelCount:d.models?.length,first:d.models?.[0]?.name,keyOk:true});
    } catch(e) { dbgLog('ERROR',e.message); }
    return;
  }
  if(!S.key){dbgLog('ERROR','No API key set. Enter key first.');return;}
  dbgLog('INFO','Testing key via GET /models...');
  try{
    const r = await fetch('https://openrouter.ai/api/v1/models',{headers:{Authorization:'Bearer '+S.key}});
    const d = await r.json();
    if(!r.ok){dbgLog('ERROR',{status:r.status,body:d});return;}
    dbgLog('RESPONSE',{status:r.status,modelCount:d.data?.length,first:d.data?.[0]?.id,keyOk:true});
  }catch(e){dbgLog('ERROR',e.message);}
}
async function testRaw(){
  if(!S.key){dbgLog('ERROR','No API key');return;}
  if(!S.model){dbgLog('ERROR','No model selected');return;}
  const ref = location.href.startsWith('http') ? location.href : 'https://nexus-or.local';
  const baseId = (S.model.apiId||S.model.id).replace(/:(free|nitro|floor|beta)$/, '');
  const body = {model:baseId,messages:[{role:'user',content:'Say hi in one word.'}],stream:false,max_tokens:16};
  dbgLog('REQUEST',{displayId:S.model.id,sendingAs:baseId,referer:ref});
  try{
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{Authorization:'Bearer '+S.key,'Content-Type':'application/json','HTTP-Referer':ref,'X-Title':'Atlas'},
      body:JSON.stringify(body)
    });
    const raw = await r.text();
    let parsed;
    try{ parsed = JSON.parse(raw); }catch{ parsed = raw.slice(0,600); }
    dbgLog('RESPONSE',{status:r.status,ok:r.ok});
    dbgLog('BODY', parsed);
    if(r.status===404){
      dbgLog('INFO','404 = model has no active endpoint on OpenRouter. Try a different model.');
    }
  }catch(e){dbgLog('ERROR',e.message);}
}
async function testKnownModel(){
  if(!S.key){dbgLog('ERROR','No API key');return;}
  const ref = location.href.startsWith('http') ? location.href : 'https://nexus-or.local';
  const testModels = ['meta-llama/llama-3.1-8b-instruct:free','google/gemma-2-9b-it:free','mistralai/mistral-7b-instruct:free'];
  for(const mid of testModels){
    const baseId = mid.replace(/:(free|nitro|floor|beta)$/,'');
    dbgLog('INFO', 'Testing known-working model: ' + mid + ' -> ' + baseId);
    try{
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions',{
        method:'POST',
        headers:{Authorization:'Bearer '+S.key,'Content-Type':'application/json','HTTP-Referer':ref,'X-Title':'Atlas'},
        body:JSON.stringify({model:baseId,messages:[{role:'user',content:'Hi'}],stream:false,max_tokens:8})
      });
      const raw = await r.text();
      let parsed; try{parsed=JSON.parse(raw);}catch{parsed=raw.slice(0,300);}
      dbgLog('RESPONSE',{model:mid,status:r.status,ok:r.ok});
      if(r.ok){
        dbgLog('INFO','SUCCESS with '+mid+' — select this model in the dropdown');
        dbgLog('REPLY', parsed?.choices?.[0]?.message?.content || parsed);
        break;
      } else {
        dbgLog('BODY',parsed);
      }
    }catch(e){dbgLog('ERROR',e.message);}
  }
}

// ── GOOGLE OAUTH + CONNECTORS ──────────────────────────────────────────────

// Baked-in OAuth Client ID — no need to enter this manually
const GOOGLE_CLIENT_ID = '175138096951-qikci6bl95n9v4drb3u7s8223cvn07hd.apps.googleusercontent.com';

// State
S.google = {
  clientId: GOOGLE_CLIENT_ID,
  accessToken: null,
  tokenExpiry: 0,
  user: null,        // { name, email, picture }
  scopes: [],
};

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
  'email', 'profile',
];

function _gTokenValid() {
  return S.google.accessToken && Date.now() < S.google.tokenExpiry - 30000;
}

function googleSignIn() {
  const clientId = GOOGLE_CLIENT_ID;
  S.google.clientId = clientId;

  const scope = GOOGLE_SCOPES.join(' ');
  const redirectUri = location.origin + location.pathname;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope,
    include_granted_scopes: 'true',
    prompt: 'select_account',
  });

  const popup = window.open(
    'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString(),
    '_blank',
    'width=520,height=620,top=100,left=200'
  );

  // Poll popup for token in fragment
  const poll = setInterval(async () => {
    try {
      if (!popup || popup.closed) {
        clearInterval(poll);
        return;
      }
      let href = '';
      try { href = popup.location.href; } catch(e) { return; } // cross-origin, still loading
      if (href.includes(redirectUri) || href.startsWith(redirectUri)) {
        clearInterval(poll);
        popup.close();
        const fragment = href.split('#')[1] || '';
        const fParams = new URLSearchParams(fragment);
        const token = fParams.get('access_token');
        const expiresIn = parseInt(fParams.get('expires_in') || '3600');
        if (token) {
          S.google.accessToken = token;
          S.google.tokenExpiry = Date.now() + expiresIn * 1000;
          await _gFetchUserInfo();
          _gUpdateUI();
          _gPersist();
          initToolDefinitions(); // re-register tools with google tools now active
          toast('Google connected ✓', 'ok');
        } else {
          toast('Google sign-in cancelled or failed', 'er');
        }
      }
    } catch(e) {}
  }, 300);
}

async function _gFetchUserInfo() {
  if (!S.google.accessToken) return;
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + S.google.accessToken }
    });
    if (r.ok) {
      const u = await r.json();
      S.google.user = { name: u.name || u.email, email: u.email, picture: u.picture };
      S.google.scopes = GOOGLE_SCOPES;
    }
  } catch(e) {}
}

function googleSignOut() {
  S.google.accessToken = null;
  S.google.tokenExpiry = 0;
  S.google.user = null;
  S.google.scopes = [];
  _gUpdateUI();
  _gPersist();
  initToolDefinitions();
  toast('Google disconnected', 'ok');
}

function _gUpdateUI() {
  const connected = _gTokenValid() && S.google.user;
  const btn = document.getElementById('gconn-signin-btn');
  const badge = document.getElementById('gconn-status-badge');
  const nameLabel = document.getElementById('gconn-name-label');
  const emailLabel = document.getElementById('gconn-email-label');
  const scopes = document.getElementById('gconn-scopes');
  const signout = document.getElementById('gconn-signout-wrap');

  if (!btn) return;
  if (connected) {
    btn.classList.add('connected');
    badge.textContent = 'Connected'; badge.className = 'gconn-status on';
    nameLabel.textContent = S.google.user.name;
    emailLabel.textContent = S.google.user.email;
    // Show avatar
    const placeholder = btn.querySelector('.gconn-avatar-placeholder');
    if (S.google.user.picture && placeholder) {
      const img = document.createElement('img');
      img.className = 'gconn-avatar';
      img.src = S.google.user.picture;
      img.onerror = () => { img.style.display='none'; placeholder.style.display='flex'; };
      placeholder.style.display = 'none';
      btn.insertBefore(img, placeholder);
    }
    if (scopes) {
      scopes.style.display = 'flex';
      ['gmail','calendar','drive'].forEach(s => {
        const el = document.getElementById('scope-' + s);
        if (el) el.className = 'gconn-scope active';
      });
    }
    if (signout) signout.style.display = 'block';
  } else {
    btn.classList.remove('connected');
    badge.textContent = 'Not connected'; badge.className = 'gconn-status off';
    nameLabel.textContent = 'Sign in with Google';
    emailLabel.textContent = 'Connect Gmail, Calendar & Drive';
    if (scopes) scopes.style.display = 'none';
    if (signout) signout.style.display = 'none';
  }
}

function _gPersist() { persist(); }

// ── TOOL CONFIRM DIALOG ───────────────────────────────────────────────────
let _tcResolveFunc = null;
function _tcResolve(allow) {
  document.getElementById('tool-confirm-modal').classList.remove('open');
  if (_tcResolveFunc) { _tcResolveFunc(allow); _tcResolveFunc = null; }
}
function _requireToolConfirm(toolName, prettyName, description, payload) {
  return new Promise(resolve => {
    document.getElementById('tc-title').textContent = '🔧 ' + prettyName;
    document.getElementById('tc-desc').textContent = description;
    document.getElementById('tc-payload').textContent =
      typeof payload === 'object' ? JSON.stringify(payload, null, 2) : String(payload);
    document.getElementById('tool-confirm-modal').classList.add('open');
    _tcResolveFunc = resolve;
  });
}

// ── GOOGLE API HELPERS ─────────────────────────────────────────────────────
async function _gApi(method, url, body) {
  if (!_gTokenValid()) throw new Error('Google token expired. Reconnect in Settings.');
  const opts = {
    method,
    headers: { Authorization: 'Bearer ' + S.google.accessToken, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!r.ok) throw new Error(json.error?.message || json.error || ('HTTP ' + r.status));
  return json;
}

// ── TOOL EXECUTORS ─────────────────────────────────────────────────────────
const GOOGLE_TOOLS = {
  // ── Gmail ──────────────────────────────────────────────────────────
  async gmail_list_messages({ query = '', maxResults = 5, labelIds = [] }) {
    const params = new URLSearchParams({ maxResults, q: query });
    if (labelIds.length) params.set('labelIds', labelIds.join(','));
    const data = await _gApi('GET', `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
    if (!data.messages?.length) return { messages: [], total: 0 };
    // Fetch snippets in parallel (up to 5)
    const details = await Promise.all(
      data.messages.slice(0, 5).map(m =>
        _gApi('GET', `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`)
      )
    );
    return {
      messages: details.map(m => ({
        id: m.id,
        snippet: m.snippet,
        subject: m.payload?.headers?.find(h => h.name === 'Subject')?.value || '',
        from: m.payload?.headers?.find(h => h.name === 'From')?.value || '',
        date: m.payload?.headers?.find(h => h.name === 'Date')?.value || '',
        unread: m.labelIds?.includes('UNREAD'),
      })),
      total: data.resultSizeEstimate || details.length,
    };
  },

  async gmail_get_message({ messageId }) {
    const m = await _gApi('GET', `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`);
    const headers = m.payload?.headers || [];
    const get = name => headers.find(h => h.name === name)?.value || '';
    // Extract body text
    function extractBody(part) {
      if (!part) return '';
      if (part.mimeType === 'text/plain' && part.body?.data)
        return atob(part.body.data.replace(/-/g,'+').replace(/_/g,'/'));
      if (part.parts) return part.parts.map(extractBody).filter(Boolean).join('\n');
      return '';
    }
    return {
      id: m.id, subject: get('Subject'), from: get('From'), to: get('To'),
      date: get('Date'), body: extractBody(m.payload).slice(0, 3000),
      snippet: m.snippet, labels: m.labelIds,
    };
  },

  async gmail_send({ to, subject, body, replyToMessageId }) {
    const allowed = await _requireToolConfirm('gmail_send', 'Send Email',
      'The AI wants to send this email. Review carefully before allowing.', { to, subject, body: body?.slice(0, 300) });
    if (!allowed) throw new Error('User denied: email send cancelled');
    const raw = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=utf-8', '', body].join('\r\n');
    const encoded = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const threadId = replyToMessageId ? (await _gApi('GET', `https://gmail.googleapis.com/gmail/v1/users/me/messages/${replyToMessageId}?format=minimal`)).threadId : undefined;
    const body2 = { raw: encoded };
    if (threadId) body2.threadId = threadId;
    const sent = await _gApi('POST', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', body2);
    return { success: true, messageId: sent.id };
  },

  async gmail_draft({ to, subject, body }) {
    const allowed = await _requireToolConfirm('gmail_draft', 'Create Email Draft',
      'The AI wants to create an email draft.', { to, subject, body: body?.slice(0, 300) });
    if (!allowed) throw new Error('User denied: draft creation cancelled');
    const raw = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=utf-8', '', body].join('\r\n');
    const encoded = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const draft = await _gApi('POST', 'https://gmail.googleapis.com/gmail/v1/users/me/drafts', { message: { raw: encoded } });
    return { success: true, draftId: draft.id };
  },

  // ── Calendar ───────────────────────────────────────────────────────
  async calendar_list_events({ timeMin, timeMax, maxResults = 10, query = '' }) {
    const now = new Date();
    const params = new URLSearchParams({
      maxResults,
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: timeMin || now.toISOString(),
      timeMax: timeMax || new Date(now.getTime() + 7 * 86400000).toISOString(),
    });
    if (query) params.set('q', query);
    const data = await _gApi('GET', `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`);
    return {
      events: (data.items || []).map(e => ({
        id: e.id, title: e.summary, start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date, location: e.location, description: e.description,
        status: e.status, attendees: e.attendees?.map(a => a.email),
      })),
    };
  },

  async calendar_create_event({ title, start, end, description, location, attendees }) {
    const allowed = await _requireToolConfirm('calendar_create_event', 'Create Calendar Event',
      'The AI wants to create a calendar event.', { title, start, end, description });
    if (!allowed) throw new Error('User denied: event creation cancelled');
    const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
    const event = {
      summary: title,
      description, location,
      start: isDate(start) ? { date: start } : { dateTime: start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: isDate(end) ? { date: end } : { dateTime: end, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    };
    if (attendees?.length) event.attendees = attendees.map(e => ({ email: e }));
    const created = await _gApi('POST', 'https://www.googleapis.com/calendar/v3/calendars/primary/events', event);
    return { success: true, eventId: created.id, link: created.htmlLink };
  },

  async calendar_delete_event({ eventId }) {
    const allowed = await _requireToolConfirm('calendar_delete_event', 'Delete Calendar Event',
      'The AI wants to delete this calendar event.', { eventId });
    if (!allowed) throw new Error('User denied: delete cancelled');
    await _gApi('DELETE', `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`);
    return { success: true };
  },

  // ── Drive ──────────────────────────────────────────────────────────
  async drive_list_files({ query = '', maxResults = 10, folderId }) {
    let q = query;
    if (folderId) q = `'${folderId}' in parents` + (q ? ' and ' + q : '');
    if (!q) q = 'trashed=false';
    const params = new URLSearchParams({
      pageSize: maxResults,
      fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
      q,
    });
    const data = await _gApi('GET', `https://www.googleapis.com/drive/v3/files?${params}`);
    return { files: data.files || [] };
  },

  async drive_get_file_content({ fileId, maxChars = 3000 }) {
    const meta = await _gApi('GET', `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`);
    let content = '';
    if (meta.mimeType === 'application/vnd.google-apps.document') {
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`, {
        headers: { Authorization: 'Bearer ' + S.google.accessToken }
      });
      content = (await r.text()).slice(0, maxChars);
    } else if (meta.mimeType?.startsWith('text/')) {
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: 'Bearer ' + S.google.accessToken }
      });
      content = (await r.text()).slice(0, maxChars);
    } else {
      content = `[Binary file: ${meta.mimeType}. Direct text extraction not supported.]`;
    }
    return { name: meta.name, mimeType: meta.mimeType, content };
  },

  async drive_create_file({ name, content, mimeType = 'text/plain', folderId }) {
    const allowed = await _requireToolConfirm('drive_create_file', 'Create Drive File',
      'The AI wants to create a file in your Google Drive.', { name, mimeType });
    if (!allowed) throw new Error('User denied: file creation cancelled');
    const metadata = { name, mimeType };
    if (folderId) metadata.parents = [folderId];
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([content], { type: mimeType }));
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + S.google.accessToken },
      body: form,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Drive upload failed');
    return { success: true, fileId: data.id, name: data.name, link: data.webViewLink };
  },
};

// ── TOOL DEFINITIONS REGISTRY ─────────────────────────────────────────────
function initToolDefinitions() {
  const base = [];

  // Only add Google tools if connected
  if (_gTokenValid()) {
    base.push(
      // Gmail
      { type:'function', function:{ name:'gmail_list_messages', description:'List emails from Gmail inbox. Use to find recent emails, search by sender/subject/content.', parameters:{ type:'object', properties:{ query:{type:'string',description:'Gmail search query, e.g. "from:alice@example.com is:unread"'}, maxResults:{type:'integer',description:'Max emails to return (1-10)',default:5} }, required:[] } } },
      { type:'function', function:{ name:'gmail_get_message', description:'Get full content of a specific email by ID.', parameters:{ type:'object', properties:{ messageId:{type:'string',description:'Gmail message ID'} }, required:['messageId'] } } },
      { type:'function', function:{ name:'gmail_send', description:'Send an email. ALWAYS show the full draft to the user and ask for confirmation before calling this.', parameters:{ type:'object', properties:{ to:{type:'string',description:'Recipient email'}, subject:{type:'string'}, body:{type:'string',description:'Plain text email body'}, replyToMessageId:{type:'string',description:'Optional: message ID to reply to'} }, required:['to','subject','body'] } } },
      { type:'function', function:{ name:'gmail_draft', description:'Create a draft email (does not send).', parameters:{ type:'object', properties:{ to:{type:'string'}, subject:{type:'string'}, body:{type:'string'} }, required:['to','subject','body'] } } },
      // Calendar
      { type:'function', function:{ name:'calendar_list_events', description:'List upcoming Google Calendar events.', parameters:{ type:'object', properties:{ timeMin:{type:'string',description:'ISO 8601 start time filter'}, timeMax:{type:'string',description:'ISO 8601 end time filter'}, maxResults:{type:'integer',default:10}, query:{type:'string',description:'Text search in events'} }, required:[] } } },
      { type:'function', function:{ name:'calendar_create_event', description:'Create a new Google Calendar event. Requires user confirmation.', parameters:{ type:'object', properties:{ title:{type:'string'}, start:{type:'string',description:'ISO 8601 datetime or YYYY-MM-DD'}, end:{type:'string',description:'ISO 8601 datetime or YYYY-MM-DD'}, description:{type:'string'}, location:{type:'string'}, attendees:{type:'array',items:{type:'string'},description:'List of attendee emails'} }, required:['title','start','end'] } } },
      { type:'function', function:{ name:'calendar_delete_event', description:'Delete a calendar event by ID. Requires user confirmation.', parameters:{ type:'object', properties:{ eventId:{type:'string'} }, required:['eventId'] } } },
      // Drive
      { type:'function', function:{ name:'drive_list_files', description:'List files in Google Drive.', parameters:{ type:'object', properties:{ query:{type:'string',description:'Drive search query'}, maxResults:{type:'integer',default:10}, folderId:{type:'string',description:'Optional folder ID to list within'} }, required:[] } } },
      { type:'function', function:{ name:'drive_get_file_content', description:'Read the text content of a Google Drive file.', parameters:{ type:'object', properties:{ fileId:{type:'string'}, maxChars:{type:'integer',default:3000} }, required:['fileId'] } } },
      { type:'function', function:{ name:'drive_create_file', description:'Create a new file in Google Drive. Requires user confirmation.', parameters:{ type:'object', properties:{ name:{type:'string'}, content:{type:'string'}, mimeType:{type:'string',default:'text/plain'}, folderId:{type:'string'} }, required:['name','content'] } } }
    );
  }

  S.toolDefinitions = base;
}

// ── TOOL CALL EXECUTOR ─────────────────────────────────────────────────────
async function _executeGoogleTool(toolName, argsStr) {
  let args;
  try { args = JSON.parse(argsStr || '{}'); } catch { args = {}; }
  const fn = GOOGLE_TOOLS[toolName];
  if (!fn) return null; // not a Google tool
  return await fn(args);
}

// ── GOOGLE DRIVE MEMORY BACKUP ─────────────────────────────────────────────
const DRIVE_BACKUP_FILENAME = 'atlas-memory-backup.json';

async function backupToDrive() {
  if (!_gTokenValid()) { toast('Connect Google first in Settings', 'er'); return; }
  try {
    const raw = SafeStorage.get(STORAGE_KEY) || '{}';
    const data = JSON.parse(raw);
    // Strip access tokens from backup for security
    if (data.google) { data.google.accessToken = null; data.google.tokenExpiry = 0; }
    const json = JSON.stringify(data, null, 2);

    // Check if backup file already exists
    const search = await _gApi('GET', `https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_BACKUP_FILENAME}' and trashed=false&fields=files(id,name)`);
    const existing = search.files?.[0];

    const form = new FormData();
    const metadata = { name: DRIVE_BACKUP_FILENAME, mimeType: 'application/json' };
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([json], { type: 'application/json' }));

    let url, method;
    if (existing) {
      url = `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`;
      method = 'PATCH';
    } else {
      url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      method = 'POST';
    }

    const r = await fetch(url, {
      method,
      headers: { Authorization: 'Bearer ' + S.google.accessToken },
      body: form,
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message || 'Upload failed'); }
    const convCount = data.convs?.length || 0;
    toast(`☁ Backed up ${convCount} conversation${convCount !== 1 ? 's' : ''} to Drive ✓`, 'ok');
  } catch(e) {
    toast('Backup failed: ' + e.message, 'er');
  }
}

async function restoreFromDrive() {
  if (!_gTokenValid()) { toast('Connect Google first in Settings', 'er'); return; }
  if (!confirm('Restore memory from Google Drive? This will replace your current local data.')) return;
  try {
    const search = await _gApi('GET', `https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_BACKUP_FILENAME}' and trashed=false&fields=files(id,name,modifiedTime)`);
    const file = search.files?.[0];
    if (!file) { toast('No backup found in Drive', 'er'); return; }

    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: { Authorization: 'Bearer ' + S.google.accessToken }
    });
    if (!r.ok) throw new Error('Download failed');
    const data = await r.json();

    // Preserve current Google token
    data.google = data.google || {};
    data.google.accessToken = S.google.accessToken;
    data.google.tokenExpiry = S.google.tokenExpiry;
    data.google.user = S.google.user;
    data.google.clientId = S.google.clientId;

    SafeStorage.set(STORAGE_KEY, JSON.stringify(data));
    const modDate = new Date(file.modifiedTime).toLocaleDateString();
    toast(`☁ Restored from Drive backup (${modDate}) — reloading…`, 'ok');
    setTimeout(() => location.reload(), 1500);
  } catch(e) {
    toast('Restore failed: ' + e.message, 'er');
  }
}

// Show/hide Drive backup buttons based on Google connection
const _origGUpdateUI = _gUpdateUI;
_gUpdateUI = function() {
  _origGUpdateUI();
  const connected = _gTokenValid() && S.google?.user;
  const bb = document.getElementById('gdrive-backup-btn');
  const rb = document.getElementById('gdrive-restore-btn');
  if (bb) bb.style.display = connected ? '' : 'none';
  if (rb) rb.style.display = connected ? '' : 'none';
};

// ── GLOBAL SYSTEM PROMPT PRESETS ──────────────────────────────────────────

const SYSTEM_PROMPT_PRESETS = {
  smart: `Respond naturally and directly. Write in clear, flowing prose — avoid bullet points and numbered lists unless the content is genuinely list-like (steps, options, items). Don't pad responses: answer the question fully, then stop. No filler phrases like "Great question!", "Certainly!", "Of course!", or "I hope this helps". No unnecessary caveats. Don't repeat the question back before answering it. Match response length to the complexity of the question — a simple question gets a short answer, a complex one gets a thorough one. Use markdown formatting only when it genuinely helps readability: headers for long documents, code blocks for code. When writing code, deliver it directly with minimal preamble.`,

  concise: `Be as concise as possible without losing accuracy. One sentence if it suffices. No preamble. No sign-off. Cut every word that doesn't carry meaning. Prefer plain prose over lists. Never restate the question.`,

  technical: `You are talking to a technical user. Skip the basics. Be precise and specific. Use correct terminology. When writing code: include types, handle errors, follow language idioms. When explaining concepts: go one level deeper than the obvious. Don't over-explain things that any competent developer would already know.`,

  clear: `Write simply and clearly. Plain language. Short sentences. No jargon unless necessary. Structure long answers with clear headers. One idea per paragraph. Prefer the simpler word when two words mean the same thing. If you're unsure, say so plainly rather than hedging with qualifications.`
};

function applyPresetPrompt(key) {
  const el = document.getElementById('global-sysprompt-input');
  if (el && SYSTEM_PROMPT_PRESETS[key]) {
    el.value = SYSTEM_PROMPT_PRESETS[key];
    el.style.borderColor = 'var(--acc2)';
    toast('✓ Preset applied — click Save to use it', 'ok');
  }
}

// Restore global sys prompt textarea and update Google UI when settings opens
const _origOpenSettings = openSettings;
openSettings = function() {
  _origOpenSettings();
  const el = document.getElementById('global-sysprompt-input');
  if (el && S.cfg.globalSysPrompt) el.value = S.cfg.globalSysPrompt;
  _gUpdateUI();
};


(function(){
  var handle = document.getElementById('art-resize-handle');
  var panel  = document.getElementById('artifact-panel');
  if (!handle || !panel) return;
  var startX, startW;
  handle.addEventListener('mousedown', function(e){
    e.preventDefault();
    // Read actual rendered width at drag start — panel may be display:none so
    // use the inline style width if set, else fall back to CSS computed value
    var inlineW = parseFloat(panel.style.width);
    if (inlineW > 0) {
      startW = inlineW;
    } else {
      // Parse the min(52vw,680px) default: take the smaller of the two
      startW = Math.min(window.innerWidth * 0.52, 680);
    }
    startX = e.clientX;
    handle.classList.add('dragging');
    // Prevent iframe from swallowing mousemove events during drag
    var cover = document.createElement('div');
    cover.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:col-resize';
    document.body.appendChild(cover);
    var main = document.getElementById('main');
    var onMove = function(ev){
      var dx = startX - ev.clientX;
      var nw = Math.min(Math.max(startW + dx, 300), window.innerWidth * 0.92);
      panel.style.width = nw + 'px';
      // Reflow chat area + conversation history live
      if (main && window.innerWidth > 600) {
        main.style.marginRight = nw + 'px';
      }
    };
    var onUp = function(){
      handle.classList.remove('dragging');
      cover.remove();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // Persist the chosen width so CSS art-open class keeps it consistent
      if (main && window.innerWidth > 600) {
        // Keep inline style in sync — CSS class fallback is overridden by inline
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
})();
