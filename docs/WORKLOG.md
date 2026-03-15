# Metah4 Backend Worklog

## Purpose
Track incidents, fixes, and the current known-good worker configuration so we can avoid regressions.

## Recent Problems And Fix Attempts

8. libsodium-wrappers replaced with tweetnacl — worker now functional (March 15, 2026)
- Symptom: All libsodium initialization patterns caused "Promise will never complete" in Workers runtime.
- Root Cause: libsodium-wrappers uses WASM and requires awaiting `sodium.ready`; the Workers runtime rejects this promise entirely regardless of wrapping strategy.
- Fix: Removed `libsodium-wrappers`, installed `tweetnacl` (pure JS NaCl `crypto_secretbox` — identical algorithm/wire format, no initialization required).
- Implementation: Replaced all sodium calls with `nacl.secretbox.open()`. Base64 and hex decoding now use `atob()` and a simple loop (no libsodium helpers needed).
- Deployed: Version `a15fa8bc-b516-4568-993d-b58b47c437bd` — confirmed working.
- Added `[9c]` body preview log (first 300 chars of raw Brave response) to help diagnose content issues (e.g. unexpected emoji in results).

1. Deploy command failed in wrong directory
- Symptom: `npm run deploy` reported missing script.
- Cause: command executed from outer workspace root instead of worker project path.
- Fix: run deploy from `~/development/metah4-backend/~/development/metah4-backend`.

2. Worker format/build errors
- Symptom: Wrangler build errors about service worker format and `node:perf_hooks` import behavior.
- Cause: `addEventListener` style worker conflicted with module expectations.
- Fix: moved to ES Module worker entrypoint using `export default { async fetch(...) { ... } }`.

3. libsodium import failure
- Symptom: build failed with no matching export for named import `sodium`.
- Cause: incorrect import style.
- Fix: use default import: `import sodium from 'libsodium-wrappers';`.

4. Runtime hang on `/search`
- Symptom: Cloudflare canceled request as hung.
- Suspected causes: sodium init blocking, bad encoded input, decryption edge cases, or hanging upstream call.
- Fixes applied:
- lazy sodium init inside handler
- bounded sodium init timeout (`Crypto init failed` on timeout)
- strict base64 decode handling with explicit `Invalid base64`
- encrypted payload length validation (`Invalid encrypted data length`)
- decryption null/failure checks (`Decryption failed`)
- Brave upstream timeout + abort (`Upstream request failed`)
- explicit missing secret checks for `SHARED_SECRET` and `BRAVE_API_KEY`

5. Privacy hardening
- Symptom: temporary debug output could leak decrypted content.
- Fix: removed `console.log('Decrypted query:', decrypted)` after stabilization.

6. Query corruption from URL encoding
- Symptom: malformed decrypted text (example looked like partial/wrong output).
- Cause: base64 query payload likely altered by URL encoding (`+` handling).
- Mitigation: frontend should send `encodeURIComponent(base64)` or use URL-safe base64.

7. Persistent runtime hangs despite guards (March 10, 2026)
- Symptom: Cloudflare "Worker's code had hung" error continues despite multiple timeout attempts.
- Investigation approach:
  - Added comprehensive numbered logging ([1] through [9]) throughout pipeline
  - Added max input length check (10,000 chars) to prevent oversized payloads
  - Wrapped `await sodium.ready` in 2-second timeout with Promise.race
  - Added step-by-step logging for every crypto operation (decode, decrypt, string conversion)
  - Added 3-second timeout on response body read via Promise.race
  - Changed `AbortController` fetch timeout to 8 seconds (well within Worker kill limit)
- Diagnostic strategy: Use `wrangler tail` to identify which numbered log appears last before hang
- Log sequence:
  - [1] Query received
  - [2] Sodium init
  - [3] Secret key conversion
  - [4] Base64 decode
  - [5] Nonce/ciphertext extraction
  - [6] Decryption
  - [7] String conversion
  - [8] Brave fetch
  - [9] Body read
- **ROOT CAUSE FOUND**: Logs showed hang occurring at [2] during sodium initialization. The `await sodium.ready` call (even wrapped in Promise.race with timeout) was causing "Promise will never complete" error.
- **SOLUTION ATTEMPT 1**: Removed `await sodium.ready` entirely. Version 3e1cea32 deployed.
- **NEW ISSUE (March 11, 2026)**: Without initialization, sodium functions failed with "Cannot read properties of undefined (reading '_malloc')" - sodium wasn't ready when methods called.
- **ROOT CAUSE ANALYSIS**: Cloudflare Workers prohibits async I/O in global scope but requires sodium to be initialized before use.
- **CORRECT PATTERN DISCOVERED**:
  - ❌ WRONG: `await sodium.ready` in glocf867e1d - March 11, 2026)

- Worker format: ES Module (`export default` fetch handler)
- Entrypoint: `src/index.ts` (configured in `wrangler.jsonc` as `main: "src/index.ts"`)
- Crypto: `libsodium-wrappers` default import with **CORRECT INITIALIZATION PATTERN**:
  - Global scope: `const sodiumReady = sodium.ready` (store promise, don't await)
  - Handler scope: `await sodiumReady` (await inside async handler)
  - This is the ONLY pattern that works in Cloudflare Workers runtime
- Sodium functions used after initialization// Global scope - store promise
  // ... inside handler:
  await sodiumReady  // Handler scope - await stored promise
  ```
- Status: ✅ RESOLVED (March 11, 2026)

## Current Status: NO WORKING BASELINE (March 11, 2026)

**CRITICAL ISSUE**: libsodium-wrappers appears fundamentally incompatible with Cloudflare Workers

- **All initialization attempts fail**:
  - v3e1cea32: No await → "_malloc undefined"
  - v948b9aa0: Await in handler → "Promise will never complete"
  - v27af7f0b: Promise.race with timeout → **STILL "Promise will never complete"**

- **Key Finding**: ANY await of `sodium.ready` (direct or wrapped) triggers Workers runtime error

- **Architecture Decision Required**:
  - Option 1: Switch to `@stablelib/xchacha20poly1305` (pure JS, no WASM)
  - Option 2: Use `libsodium` (C library) via nodejs_compat with different binding
  - Option 3: Switch to Web Crypto API (different encryption scheme)
  - Option 4: Use Cloudflare Workers built-in WebAssembly approach differently

**Previous baseline (superseded by runtime incompatibility):**
- Worker format: ES Module (`export default` fetch handler)
- Entrypoint: `src/index.ts`
- Attempted crypto: libsodium-wrappers (BLOCKED)
- Endpoint: `GET /search?q=<encrypted_base64>`
- CORS: `Access-Control-Allow-Origin: *`, `GET, OPTIONS`
- Upstream: Brave search API with `X-Subscription-Token` and AbortController timeout (8s)
- Input validation: Max query length 10,000 chars, payload length checks
- Error handling: Comprehensive try-catch blocks with JSON error responses
- Diagnostic logging: Numbered logs ([1]-[9]) throughout pipeline for troubleshooting
- Required secrets:
  - `BRAVE_API_KEY`
  - `SHARED_SECRET` (32-byte hex key)
- Logging policy: No decrypted query logs in production

## Quick Validation Checklist

1. `npm run deploy` from worker project directory.
2. Confirm secrets exist:
- `npx wrangler secret put BRAVE_API_KEY`
- `npx wrangler secret put SHARED_SECRET`
3. Test:
- `GET /` should return quickly.
- `GET /search?q=...` should return JSON or controlled error JSON (not hang).
4. If frontend encrypts in browser, ensure query param is URL-safe (`encodeURIComponent` or URL-safe base64).
