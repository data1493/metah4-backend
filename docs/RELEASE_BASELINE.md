# Release Baseline: v0.1-stable

## Intent
Freeze a known-good backend state for Metah4 encrypted search proxy. No further tweaks unless a major break/regression occurs.

## Baseline Metadata

- Git tag: `v0.1-stable`
- Baseline commit: `<to-be-filled>`
- `src/index.ts` SHA-256: `744d76fc1ba64cee1b9ff24b9f613d4b0c7ac4dd02d0cc03278432b52c269a07`
- Worker URL: `https://metah4-backend.metah4-backend.workers.dev`

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
