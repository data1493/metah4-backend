# Metah4 Backend

Cloudflare Worker that provides an encrypted search proxy to Brave Search API.

## Architecture

```
Frontend (Browser)
    ↓ (encrypts query with tweetnacl/NaCl secretbox)
   [encrypted base64 payload]
    ↓ GET /search?q=...
Cloudflare Worker (this repo)
    ↓ (decrypts with shared secret)
   [plaintext query]
    ↓
Brave Search API
    ↓ [JSON results]
Frontend (Browser)
```

## Quick Start

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Create secrets file from template
cp .dev.vars.example .dev.vars
# Edit .dev.vars and fill in SHARED_SECRET and BRAVE_API_KEY

# 3. Start local worker (http://localhost:8787)
npm run dev
```

### Available Scripts
| Script | Description |
|---|---|
| `npm run dev` | Start local worker at http://localhost:8787 |
| `npm test` | Run test suite (10 tests) |
| `npm run typecheck` | TypeScript type check (no emit) |
| `npm run lint` | ESLint — errors fail, console.log warns |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npm run cf-typegen` | Regenerate worker-configuration.d.ts |

### Deployment
```bash
npm run deploy
```

### Set Production Secrets
```bash
npx wrangler secret put SHARED_SECRET
npx wrangler secret put BRAVE_API_KEY
```

### Monitor Logs
```bash
npx wrangler tail
```

## Documentation

### Essential Reading
- **[CLOUDFLARE_WORKERS_PATTERNS.md](docs/CLOUDFLARE_WORKERS_PATTERNS.md)** - Critical patterns and gotchas for Cloudflare Workers (READ THIS FIRST if new to Workers)
- **[RELEASE_BASELINE.md](docs/RELEASE_BASELINE.md)** - Current stable version and rollback information
- **[WORKLOG.md](docs/WORKLOG.md)** - Detailed history of issues, fixes, and debugging sessions

### Why These Docs Matter

This project encountered several runtime-specific issues unique to Cloudflare Workers. The patterns documented here represent hard-won lessons:

1. **libsodium incompatibility** - `libsodium-wrappers` (WASM) is fundamentally broken in Workers runtime. ALL `sodium.ready` await patterns fail. **Solved**: replaced with `tweetnacl` (pure JS, identical NaCl secretbox algorithm, no initialization needed).
2. **Async restrictions** - Global scope limitations that don't exist in Node.js
3. **Timeout handling** - Workers have hard 10-second limit requiring defensive coding
4. **Module format** - Must use ES Modules, Service Worker format doesn't work
5. **Local dev secrets** - Wrangler reads `.dev.vars` (not `.env`) for local secrets. Must create this file manually after cloning — it is gitignored.

## Project Structure

```
src/
  index.ts          # Main worker handler (ES Module)
test/
  index.spec.ts     # Test suite (10 tests, real nacl encryption)
  env.d.ts          # cloudflare:test type augmentation
docs/
  CLOUDFLARE_WORKERS_PATTERNS.md  # Best practices & gotchas
  RELEASE_BASELINE.md             # Stable version tracking
  WORKLOG.md                      # Incident history
.dev.vars.example   # Template for local secrets (copy → .dev.vars)
eslint.config.js    # ESLint flat config
wrangler.jsonc      # Cloudflare configuration
```

## Environment Variables

### Local (.dev.vars)
Create `.dev.vars` in the project root (gitignored — never commit):
```bash
SHARED_SECRET=your_64_char_hex_key_here
BRAVE_API_KEY=your_brave_api_key_here
```
> Must use `.dev.vars`, not `.env` — wrangler dev only reads `.dev.vars`.

### Production (via wrangler)
Secrets must be set via CLI (not committed to config):
```bash
npx wrangler secret put SHARED_SECRET
npx wrangler secret put BRAVE_API_KEY
```

## API Endpoint

### Search
```
GET /search?q=<encrypted_base64_payload>
```

**Response:** JSON results from Brave Search API (proxied)

**Encryption:** Frontend encrypts query using NaCl `crypto_secretbox` (tweetnacl on the backend), base64-encodes the nonce+ciphertext payload

## Troubleshooting

### Worker hangs or timeouts
- Check `wrangler tail` for numbered logs [0]-[9]
- See [WORKLOG.md](docs/WORKLOG.md) section 7 for hang debugging history
- Verify libsodium initialization pattern matches [CLOUDFLARE_WORKERS_PATTERNS.md](docs/CLOUDFLARE_WORKERS_PATTERNS.md)

### "_malloc undefined" errors
- Missing sodium initialization - see correct pattern in [CLOUDFLARE_WORKERS_PATTERNS.md](docs/CLOUDFLARE_WORKERS_PATTERNS.md)

### "Disallowed operation in global scope"
- Async operation in global scope - move to handler
- See [CLOUDFLARE_WORKERS_PATTERNS.md](docs/CLOUDFLARE_WORKERS_PATTERNS.md) for details

### Decryption fails
1. Verify `SHARED_SECRET` is set: `npx wrangler secret list`
2. Check frontend/backend use same key
3. Verify base64 variant matches (standard vs URL-safe)
4. Check `wrangler tail` logs — look for `[6c]` (decrypt failed) message

## Current Status

**Version:** a15fa8bc-b516-4568-993d-b58b47c437bd  
**Deployed:** March 15, 2026  
**Status:** ✅ Working  
**URL:** https://metah4-backend.metah4-backend.workers.dev

**Overhaul (March 15, 2026):** project modernized — privacy fix (removed plaintext log), ESLint, 10-test suite with real crypto, CI/CD, .dev.vars.example, cleaned config.

See [RELEASE_BASELINE.md](docs/RELEASE_BASELINE.md) for freeze policy and rollback information.

## Key Lessons

If you're new to Cloudflare Workers, these were the hardest lessons learned:

1. **You cannot `await` in global scope** - This includes `await sodium.ready`
2. **libsodium-wrappers is incompatible** - ANY await of `sodium.ready` (even with Promise.race timeout) causes "Promise will never complete"
3. **Use `tweetnacl` instead** - Pure JS NaCl secretbox, identical algorithm, no initialization needed, confirmed working in Workers
4. **Workers timeout at 10 seconds** - Use AbortController and Promise.race for all external calls
5. **Secrets via CLI only** - Production secrets must be set with `wrangler secret put`, never in config files

Full details in [CLOUDFLARE_WORKERS_PATTERNS.md](docs/CLOUDFLARE_WORKERS_PATTERNS.md).

---

Last Updated: March 15, 2026
