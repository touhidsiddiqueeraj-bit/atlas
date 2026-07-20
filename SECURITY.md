# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in Atlas, please report it responsibly:

1. **Do NOT open a public GitHub issue** for security vulnerabilities.
2. Email the maintainer directly, or open a private security advisory via GitHub's
   [security advisory feature](https://github.com/touhidsiddiqueeraj-bit/atlas/security/advisories/new).
3. Include a clear description of the issue, steps to reproduce, and the potential impact.
4. You will receive a response within 72 hours.

## Scope

Atlas is a client-side-only application. The following are considered in-scope for
security reports:

- **API key leakage** — keys must never be written to localStorage, IndexedDB, or
  sent to any endpoint other than the user's chosen AI provider.
- **XSS in rendered output** — markdown or code-block rendering that allows script
  injection into the Atlas UI (not into the sandboxed preview iframe, which is
  intentional).
- **Sandbox escape** — if the artifact preview iframe can access the parent Atlas
  window's credentials or DOM.
- **Drive sync leaks** — if Google Drive sync writes data outside the app's own
  `atlas-chat-history.json` file.

## Out of scope

- **Content rendered inside the artifact preview iframe** — this is sandboxed
  (`allow-scripts allow-same-origin allow-forms`) and runs untrusted model output
  by design. Users preview code at their own risk.
- **API key handling by third-party providers** — once a key is sent to OpenRouter,
  Gemini, etc., it is governed by that provider's security policy, not Atlas's.
- **Local model behavior** — WebLLM runs model weights in the browser; any harmful
  model output is the responsibility of the model's creator, not Atlas.
- **Self-hosted instances with modified code** — only the code in this repository
  is in scope. Forks and modified versions are the responsibility of their
  maintainers.

## Security architecture

Atlas's security model is documented in [ARCHITECTURE.md](./ARCHITECTURE.md#security-model).
Key points:

- API keys are stored in the browser's Credential Management API when available
  (never accessible to JavaScript after save), falling back to `sessionStorage`
  in Firefox (lost on tab close).
- API keys are NEVER written to `localStorage` or `IndexedDB`.
- API keys are NEVER included in conversation exports or Google Drive syncs.
- All AI provider traffic uses HTTPS.
- All markdown output is sanitized with DOMPurify before being inserted into the DOM.
- The artifact preview iframe uses the `sandbox` attribute to restrict form
  submission, popups, and navigation.

## Supported versions

Only the latest release on the `main` branch receives security updates.
