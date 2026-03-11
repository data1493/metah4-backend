# Release Baseline: NO STABLE VERSION (Current)

## Status: BLOCKED ON CRYPTO LIBRARY INCOMPATIBILITY

Date: March 11, 2026

**Critical Issue:** libsodium-wrappers is fundamentally incompatible with Cloudflare Workers runtime.

## Failed Attempts Documented

- v27af7f0b (March 11, 2026): Promise.race with timeout → "Promise will never complete"
- v948b9aa0 (March 11, 2026): Direct await in handler → "Promise will never complete"
- v3e1cea32 (March 10, 2026): No initialization → "_malloc undefined"

## Architecture Decision Needed

Must choose alternative crypto library:

1. **@stablelib/xchacha20poly1305** - Pure JS, same cipher as libsodium
2. **Web Crypto API** - Built-in but requires different encryption scheme
3. **tweetnacl-js** - Lighter NaCl implementation

## Last Deployed (Non-Functional)

- Cloudflare Worker Version: `27af7f0b-ec5c-4536-8ecb-cc00d21f06ab`
- Worker URL: `https://metah4-backend.metah4-backend.workers.dev`
- Issue: "Promise will never complete" on all requests

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

- Treat `v0.3-stable` (version 27af7f0b) as current stable rollback point.
- Reference `docs/CLOUDFLARE_WORKERS_PATTERNS.md` for implementation patterns
- Do not modify `src/index.ts` unless:
  - production behavior regresses, or
  - a security/privacy issue is identified, or
  - an external dependency/API change breaks behavior.

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
