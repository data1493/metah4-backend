# Release Baseline: v0.4-stable (Current)

## Status: ✅ WORKING

Date: March 15, 2026

**Fix:** Replaced `libsodium-wrappers` (WASM, incompatible with Workers runtime) with `tweetnacl` (pure JS NaCl, no initialization required). Same `crypto_secretbox` algorithm — fully compatible with the existing frontend encryption.

## Baseline Metadata

- Cloudflare Worker Version: `a15fa8bc-b516-4568-993d-b58b47c437bd`
- Worker URL: `https://metah4-backend.metah4-backend.workers.dev`
- Crypto library: `tweetnacl` (pure JS, no WASM)
- Status: ✅ Deployed and functional

## Required Secrets

- `SHARED_SECRET` (32-byte hex key)
- `BRAVE_API_KEY`

## Smoke Tests

1. Liveness (must not hang):
```bash
curl -i --max-time 10 'https://metah4-backend.metah4-backend.workers.dev/search?q='
```
Expected: fast JSON error (`400 Missing q`), no runtime hang.

2. Functional encrypted search (frontend-generated encrypted `q`):
```bash
curl -i --max-time 10 'https://metah4-backend.metah4-backend.workers.dev/search?q=<encrypted_base64_q>'
```
Expected: JSON response proxied from Brave (status usually `200`) and no hang.

## Diagnostic Logging

All requests emit numbered logs visible via `npx wrangler tail`:
- `[1]` Query received
- `[3]` Secret key conversion
- `[4]` Base64 decode
- `[5]` Nonce/ciphertext split
- `[6]` Decryption
- `[7c]` Decrypted query string
- `[8b]` Brave response status
- `[9c]` Raw Brave body preview (first 300 chars)

## Freeze Policy

- Treat `v0.4-stable` (version a15fa8bc) as current stable rollback point.
- Reference `docs/CLOUDFLARE_WORKERS_PATTERNS.md` for implementation patterns.
- Do not modify `src/index.ts` unless:
  - production behavior regresses, or
  - a security/privacy issue is identified, or
  - an external dependency/API change breaks behavior.

## Failed Attempts (Historical)

- v27af7f0b (March 11, 2026): libsodium Promise.race with timeout → "Promise will never complete"
- v948b9aa0 (March 11, 2026): libsodium direct await in handler → "Promise will never complete"
- v3e1cea32 (March 10, 2026): libsodium no initialization → "_malloc undefined"

---

# Release Baseline: v0.2-stable (Superseded)

## Baseline Metadata
- Cloudflare Worker Version: `948b9aa0-3b6d-4014-9421-a67e80522c69`
- Release Date: March 11, 2026 (earlier)
- Superseded by: v0.3-stable (March 11, 2026)
- Issue: Attempted direct await of sodium.ready still caused hangs

---

# Release Baseline: v0.2-stable (Superseded)

## Baseline Metadata
- Cloudflare Worker Version: `3e1cea32-5831-436c-808b-9fda89de1a57`
- Release Date: March 10, 2026
- Superseded by: v0.3-stable (March 11, 2026)
- Issue: Removed sodium initialization entirely, causing "_malloc undefined" errors

---

# Release Baseline: v0.1-stable (Superseded)

## Intent
Freeze a known-good backend state for Metah4 encrypted search proxy. No further tweaks unless a major break/regression occurs.

## Baseline Metadata

- Git tag: `v0.1-stable`
- Baseline commit: `94088b5`
- `src/index.ts` SHA-256: `744d76fc1ba64cee1b9ff24b9f613d4b0c7ac4dd02d0cc03278432b52c269a07`
- Worker URL: `https://metah4-backend.metah4-backend.workers.dev`
- **Note**: This version had runtime hang issues related to `await sodium.ready`

## Required Secrets

- `SHARED_SECRET` (32-byte hex key)
- `BRAVE_API_KEY`

## Smoke Tests

1. Liveness (must not hang):
```bash
curl -i --max-time 10 'https://metah4-backend.metah4-backend.workers.dev/search?q='
```
Expected: fast JSON error (`400 Missing q`), no runtime hang.

2. Functional encrypted search (frontend-generated encrypted `q`):
```bash
curl -i --max-time 10 'https://metah4-backend.metah4-backend.workers.dev/search?q=<encrypted_base64_q>'
```
Expected: JSON response proxied from Brave (status usually `200`) and no hang.

## Freeze Policy

- Treat `v0.1-stable` as rollback point.
- Do not modify `src/index.ts` unless:
- production behavior regresses, or
- a security/privacy issue is identified, or
- an external dependency/API change breaks behavior.
