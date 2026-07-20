/**
 * Atlas — Shared Utilities
 * File: modules/utils.js
 *
 * Tiny, dependency-free helpers used across atlas.js. Loaded BEFORE atlas.js
 * (see index.html) so every function in atlas.js can reference them at parse
 * time. Kept in its own file so they can be unit-tested in isolation.
 *
 * Contents:
 *   esc(s)            — HTML-escape a string for safe innerHTML interpolation
 *   utf8ToB64(s)      — UTF-8 safe encode → base64 (browser-safe, no Node Buffer)
 *   b64ToUtf8(s)      — base64 → UTF-8 safe decode
 *   clampLen(s, n)    — Clamp a string to n chars with an ellipsis
 */

// HTML-escape. Used everywhere we interpolate dynamic strings into innerHTML.
// Order matters: & must be first so we don't double-escape the entities we add.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// UTF-8 → base64. We can't use btoa() directly on non-ASCII strings (it throws
// on code points > 0xFF), so we encode to UTF-8 bytes first via TextEncoder,
// then convert each byte to a char code, then btoa the resulting binary string.
function utf8ToB64(s) {
  const bytes = new TextEncoder().encode(String(s == null ? '' : s));
  let bin = '';
  const chunk = 0x8000; // 32k chunks — avoid call-stack overflow on large files
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// base64 → UTF-8. Inverse of utf8ToB64: atob gives us a binary string, we
// convert to a byte array, then TextDecoder handles the UTF-8 decoding.
function b64ToUtf8(s) {
  const bin = atob(String(s == null ? '' : s));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// Truncate to n chars with an ellipsis if the string was truncated.
// Used in toast notifications and sidebar titles.
function clampLen(s, n) {
  const str = String(s == null ? '' : s);
  if (str.length <= n) return str;
  return str.slice(0, Math.max(0, n - 1)) + '…';
}
