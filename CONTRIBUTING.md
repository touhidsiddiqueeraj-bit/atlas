# Contributing to Atlas

---

## Setup

Atlas has zero build step. Clone and serve:

```bash
git clone https://github.com/touhidsiddiqueeraj-bit/atlas.git
cd atlas
python3 -m http.server 8000
# Open http://localhost:8000
```

Any HTTP server works — `npx serve .`, `php -S 0.0.0.0:8000`, etc. `file://` is not recommended (storage restrictions).

---

## Codebase Tour

### File locations

| File | What goes here |
|------|----------------|
| `index.html` | HTML elements, element IDs, inline `data-click` event handlers. No logic — just structure. |
| `atlas.css` | All styles. CSS custom properties for theming. No inline styles in JS — use classes. |
| `atlas.js` | All application logic. Organized in ~56 sections separated by `// ── SECTION NAME ──` comments. |

### Conventions

- **No external dependencies** — every library is lazy-loaded on first use. The initial page load is three files and zero requests.
- **Single state object** — all runtime state lives in the global `S` object. UI is updated imperatively after state changes.
- **No build step** — edit any file and refresh. No TypeScript, no bundler, no preprocessor.
- **IIFEs for subsystems** — `LocalModelManager`, `KeyStore`, `ChatStorage` are wrapped in IIFEs to encapsulate private state.
- **Functions over classes** — the codebase uses plain functions and objects. No `class` syntax except inside lazy-loaded libraries.
- **Snake_case for internal helpers** — private helper functions prefixed with `_` (e.g., `_doProbe`, `_refreshSettingsUI`).
- **camelCase for public API** — exported functions use camelCase (e.g., `sendMessage`, `renderMarkdown`).

### Testing

Atlas does not have an automated test suite. Changes are verified manually:

1. Open Atlas in a browser
2. Exercise the changed feature through its full lifecycle
3. Check the browser console for errors
4. Verify the feature works across at least two providers (Gemini + OpenRouter for most features)

---

## How To: Add a Provider

1. **Add a model fallback list** — define a `FALLBACK` array near the existing ones (lines 57–85). Each entry: `{ id, name, context_length, description?, pricing? }`.

2. **Add a state field** — add the API key field to `S` (e.g., `S.anthropicKey`).

3. **Add key UI** — extend the API key tab renderer in the settings panel. Follow the existing tabbed pattern.

4. **Add provider logic in `sendMessage()`** — add a branch at line ~3875 (OpenAI-compatible providers) or ~3433 (Gemini/proprietary) for the new provider's API format.

5. **Add model fetch** — extend the `switch` statement around line 2234–2466 to fetch available models from the provider's API.

6. **Register in `reloadModels()`** — append the fetched models to `S.allModels`.

7. **Add cost data** — extend pricing entries if the provider has public per-model costs.

---

## How To: Add a Built-in Skill

1. Add an entry to `BUILTIN_SKILLS` (line 365):

```js
{
  id: 'my-skill',
  icon: '🔧',
  name: 'My Skill',
  desc: 'Short description of what it does',
  prompt: 'System prompt injected when this skill is active...'
}
```

2. Add a corresponding badge in the Skills settings section in `index.html` (around line 677).

3. The skill is automatically available in the skill selector and auto-detect system.

---

## How To: Add a Tool

1. **Define the tool** — add an entry in `initToolDefinitions()` (line 1563):

```js
{
  type: 'function',
  function: {
    name: 'my_tool',
    description: 'What it does',
    parameters: {
      type: 'object',
      properties: { ... },
      required: ['...']
    }
  }
}
```

2. **Implement execution** — add a case in `executeToolCall()` (line 1626):

```js
case 'my_tool':
  result = await doMyTool(args);
  break;
```

3. The tool is automatically included in all API requests (OpenAI-compat providers). Gemini uses a separate path — add the tool definition to the Gemini-specific tools section if needed.

---

## Pull Request Guidelines

- **One file changes preferred** — most features touch only `atlas.js`. Avoid scattering changes across all three files.
- **CSS in `atlas.css`** — do not inject inline styles via JS unless unavoidable. Add a class and style it in the CSS file.
- **No new external dependencies** — lazy-load via dynamic `<script>` injection only when the feature is activated. Never add a blocking `<script src="...">` in `<head>`.
- **State in `S`** — new runtime state goes in the `S` object. Use `persist()` for settings, `ChatStorage` for conversations.
- **Match section style** — read the surrounding code and match its conventions. If the section uses function declarations, use function declarations.
- **Update docs** — if you add a provider, model, skill, or tool, update the relevant section in `ARCHITECTURE.md`.

### Manual QA Checklist

Before submitting a PR, verify:

- [ ] The feature works on both Dark and Light themes
- [ ] Streaming output renders smoothly (no jank, no blank states)
- [ ] Error states show a toast message and don't break the UI
- [ ] The feature persists across page reload (if it should)
- [ ] The feature degrades gracefully when the provider is offline
- [ ] Abort/stop mid-response works and the UI resets cleanly
- [ ] No new console errors or warnings
