# Metah4 Backend Worklog

## Purpose
Track incidents, fixes, and the current known-good worker configuration so we can avoid regressions. Entries are in **chronological order** — oldest at top, newest at bottom.

---

## Entry 1 — Deploy command failed in wrong directory
**Date:** Early March 2026

- **Symptom:** `npm run deploy` reported missing script.
- **Cause:** Command executed from the outer workspace root instead of the worker project path.
- **Fix:** Run all npm scripts from the project root (`~/development/metah4-backend`).

---

## Entry 2 — Worker format/build errors
**Date:** Early March 2026

- **Symptom:** Wrangler build errors about service worker format and `node:perf_hooks` import behavior.
- **Cause:** `addEventListener` style worker conflicted with ES module expectations.
- **Fix:** Moved to ES Module worker entrypoint: `export default { async fetch(...) { ... } }`.

---

## Entry 3 — libsodium import failure
**Date:** Early March 2026

- **Symptom:** Build failed with "no matching export for named import `sodium`".
- **Cause:** Incorrect import style.
- **Fix:** Use default import: `import sodium from 'libsodium-wrappers'`.

---

## Entry 4 — Runtime hang on `/search`
**Date:** Early March 2026

- **Symptom:** Cloudflare cancelled requests as hung.
- **Suspected causes:** sodium init blocking, bad encoded input, decryption edge cases, hanging upstream call.
- **Fixes applied:**
  - Lazy sodium init inside handler
  - Bounded sodium init timeout (`Crypto init failed` on timeout)
  - Strict base64 decode handling
  - Encrypted payload length validation
  - Decryption null/failure checks
  - Brave upstream timeout + AbortController
  - Explicit missing-secret checks for `SHARED_SECRET` and `BRAVE_API_KEY`

---

## Entry 5 — Privacy hardening
**Date:** Early March 2026

- **Symptom:** Debug output could leak decrypted plaintext query content to log streams.
- **Fix:** Removed `console.log('Decrypted query:', decrypted)` after stabilization.

---

## Entry 6 — Query corruption from URL encoding
**Date:** Early March 2026

- **Symptom:** Malformed decrypted text after transport.
- **Cause:** Base64 `+` characters replaced with spaces by URL decoding.
- **Mitigation:** Frontend must send `encodeURIComponent(base64)` or use URL-safe base64.

---

## Entry 7 — Persistent runtime hangs despite guards
**Date:** March 10, 2026

- **Symptom:** Cloudflare "Worker's code had hung" error continued despite multiple timeout attempts.
- **Investigation:** Added comprehensive numbered logging [1]–[9] throughout request pipeline:
  - `[1]` Query received
  - `[2]` Sodium init
  - `[3]` Secret key conversion
  - `[4]` Base64 decode
  - `[5]` Nonce/ciphertext extraction
  - `[6]` Decryption
  - `[7]` String conversion
  - `[8]` Brave fetch
  - `[9]` Body read
- **Root cause found:** Logs showed hang at `[2]`. `await sodium.ready` (even with `Promise.race` timeout) caused "Promise will never complete" in the Workers runtime.
- **Attempts:**
  - v3e1cea32: Removed `await sodium.ready` entirely → `"_malloc undefined"` (sodium not initialized)
  - v948b9aa0: Direct `await sodium.ready` in handler → "Promise will never complete"
  - v27af7f0b: `Promise.race([sodium.ready, timeout])` → still "Promise will never complete"
- **Conclusion:** `libsodium-wrappers` (WASM-based) is fundamentally incompatible with Cloudflare Workers runtime. See CLOUDFLARE_WORKERS_PATTERNS.md for full analysis.

---

## Entry 8 — libsodium-wrappers replaced with tweetnacl — worker functional
**Date:** March 15, 2026

- **Problem:** All libsodium initialization patterns failed in Workers runtime.
- **Root cause:** `libsodium-wrappers` requires WASM + `await sodium.ready`; Workers runtime rejects any await of that promise regardless of wrapping strategy.
- **Fix:** Replaced `libsodium-wrappers` with `tweetnacl` (pure JS NaCl `crypto_secretbox` — identical algorithm and wire format, no initialization required).
- **Implementation:** All sodium calls replaced with `nacl.secretbox.open()`. Base64 and hex decoding use `atob()` and a simple loop — no libsodium helpers needed.
- **Deployed:** Version `a15fa8bc-b516-4568-993d-b58b47c437bd` — confirmed working.
- **Also added:** `[9c]` body preview log (first 300 chars of raw Brave response) to diagnose unexpected content.

---

## Entry 9 — Local dev ERR_CONNECTION_REFUSED
**Date:** March 15, 2026

- **Symptom:** Frontend search threw `Network Error` / `ERR_CONNECTION_REFUSED` against `http://localhost:8787`.
- **Root cause 1:** `wrangler dev` was not running. Vite proxy forwards `/api/chimp/search` → `http://localhost:8787` but nothing was listening there.
- **Root cause 2:** No `.dev.vars` file existed — `SHARED_SECRET` and `BRAVE_API_KEY` would be missing.
- **Root cause 3:** `wrangler.jsonc` had `compatibility_date = "2026-03-01"` — updated to `2025-01-01`.
- **Fix:**
  - Created `.dev.vars` with correct `SHARED_SECRET` and `BRAVE_API_KEY`
  - Updated `compatibility_date` to `2025-01-01`
  - Started `wrangler dev` from project root
- **Confirmed working:**
  - `GET /` → `{"error":"Missing q"}` (fast, no hang)
  - `GET /search?q=test` → `{"error":"Payload too short"}` (correct rejection of unencrypted input)
- **Notes:**
  - `.dev.vars` is gitignored — never commit. Copy from `.dev.vars.example` after fresh clones.
  - `wrangler tail` (for production logs) and `wrangler dev` (local) must run in separate terminals.

---

## Entry 10 — Project modernization overhaul
**Date:** March 15, 2026

- **Changes:**
  - **Security:** Removed `[7c] DECRYPTED QUERY` log — plaintext user search queries must not appear in Cloudflare log streams.
  - **Config cleanup:** Removed `jsx:react-jsx` from `tsconfig.json` (irrelevant for a Worker); stripped ~35 lines of commented boilerplate from `wrangler.jsonc`; bumped package version to 1.0.0.
  - **ESLint:** Added `eslint.config.js` with `@typescript-eslint/recommended`. `no-console:warn` keeps diagnostic logs visible in lint output; `no-explicit-any:error`; `no-unused-vars:error`.
  - **Tests:** Rewrote entire test suite (was "Hello World" scaffold — 0% coverage of real code). 10 tests covering CORS, method validation, query validation, crypto errors, happy path (real nacl encryption), and upstream error handling. All passing.
  - **DX:** Added `.dev.vars.example`, `typecheck` script, `.vscode/extensions.json`.
  - **CI/CD:** GitHub Actions workflows for lint+typecheck+test on PR, auto-deploy to Cloudflare on main push.
  - **Docs:** README updated with scripts table, architecture fix, troubleshooting. WORKLOG reordered chronologically.
- **Branch:** `overhaul/modernize-project` → merged to `main`.

---

## Entry 11 — Location-based search: country param forwarding
**Date:** March 26, 2026

- **Feature:** Location-based search results (Option 1 — Browser Geolocation).
- **Backend change:** Worker now reads the optional `country` query param from the incoming request and appends it to the Brave Search API URL when present. If absent (user has location toggle off), Brave defaults to global results — no change in behavior.
- **Implementation:** `src/index.ts` — `url.searchParams.get('country')` read after decryption; `URLSearchParams` used to build Brave URL cleanly; `country` appended only when truthy.
- **Contract:** Frontend sends `GET /search?q=<encrypted>&country=<ISO-3166-1-alpha-2>` (country optional). Worker passes value through unchanged.
- **Tests added:** 3 new tests in `test/index.spec.ts` — country forwarded when present, omitted when absent, value passed unchanged. Total test count: 13.
- **Branch:** `feat/location-country-param` (not yet merged — awaiting frontend implementation).
- **Status:** Backend complete. Frontend changes (toggle UI, geolocation handler, `timezoneToCountry` util) pending in `metah4` frontend repo.

---

## Quick Validation Checklist

```bash
npm run typecheck  # zero type errors
npm run lint       # zero lint errors (console.log warns are expected)
npm test           # 13 tests pass
npm run dev        # http://localhost:8787 responds
curl http://localhost:8787/                # → {"error":"Missing q"}
curl 'http://localhost:8787/search?q=x'  # → {"error":"Payload too short"}
```

For production:
```bash
npx wrangler secret list   # confirm SHARED_SECRET and BRAVE_API_KEY set
npm run deploy             # deploy to Cloudflare
npx wrangler tail          # monitor live logs
```

- Symptom: Frontend search threw `Network Error` / `ERR_CONNECTION_REFUSED` hitting `http://localhost:8787`.
- Root Cause 1: `wrangler dev` was not running. The Vite proxy forwards `/api/chimp/search` → `http://localhost:8787` but nothing was listening there.
- Root Cause 2: No `.dev.vars` file existed, so `SHARED_SECRET` and `BRAVE_API_KEY` would have been missing for any local dev run.
- Root Cause 3: `wrangler.toml` (outer stub) had `compatibility_date = "2024-01-01"` and `wrangler.jsonc` (inner project) had `2026-03-01`; both updated to `2025-01-01` to match stable Workers runtime.
- Fix:
  - Created `.dev.vars` in project root with correct `SHARED_SECRET` and `BRAVE_API_KEY`.
  - Updated `compatibility_date` to `2025-01-01` in both wrangler configs.
  - Started `wrangler dev` from `~/development/metah4-backend/~/development/metah4-backend`.
- Confirmed working:
  - `GET /` → `{"error":"Missing q"}` (fast, no hang)
  - `GET /search?q=test` → `{"error":"Payload too short"}` (correct rejection of unencrypted input)
- Note: `.dev.vars` is gitignored — never commit secrets. Re-create from `SHARED_SECRET` and real Brave API key after fresh clones.
- Note: When running `wrangler tail` for production log monitoring, a *separate* terminal is needed for `wrangler dev` local instance.

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
