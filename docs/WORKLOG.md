# Metah4 Backend Worklog

## Purpose
Track incidents, fixes, and the current known-good worker configuration so we can avoid regressions.

## Recent Problems And Fix Attempts

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

## Current Known-Good Baseline

- Worker format: ES Module (`export default` fetch handler)
- Entrypoint: `src/index.ts` (configured in `wrangler.jsonc` as `main: "src/index.ts"`)
- Crypto: `libsodium-wrappers` default import with lazy init and timeout guard
- Endpoint: `GET /search?q=<encrypted_base64>`
- CORS: `Access-Control-Allow-Origin: *`, `GET, OPTIONS`
- Upstream: Brave search API with `X-Subscription-Token`
- Required secrets:
- `BRAVE_API_KEY`
- `SHARED_SECRET` (32-byte hex key)
- Logging policy: no decrypted query logs

## Quick Validation Checklist

1. `npm run deploy` from worker project directory.
2. Confirm secrets exist:
- `npx wrangler secret put BRAVE_API_KEY`
- `npx wrangler secret put SHARED_SECRET`
3. Test:
- `GET /` should return quickly.
- `GET /search?q=...` should return JSON or controlled error JSON (not hang).
4. If frontend encrypts in browser, ensure query param is URL-safe (`encodeURIComponent` or URL-safe base64).
