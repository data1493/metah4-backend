# Metah4 Backend

Cloudflare Worker that provides an encrypted search proxy to Brave Search API.

## Architecture

```
Frontend (Browser)
    ↓ (encrypts query with libsodium)
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
npm install
npm run dev  # Starts local worker
```

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

1. **libsodium initialization** - Special pattern required to avoid hangs AND initialization errors
2. **Async restrictions** - Global scope limitations that don't exist in Node.js
3. **Timeout handling** - Workers have hard 10-second limit requiring defensive coding
4. **Module format** - Must use ES Modules, Service Worker format doesn't work

## Project Structure

```
src/
  index.ts          # Main worker handler (ES Module format)
docs/
  CLOUDFLARE_WORKERS_PATTERNS.md  # Best practices & gotchas
  RELEASE_BASELINE.md             # Stable version tracking
  WORKLOG.md                      # Detailed incident history
test/
  index.spec.ts     # Tests
wrangler.jsonc      # Cloudflare configuration
```

## Environment Variables

### Local (.env)
```bash
SHARED_SECRET=your_32_byte_hex_key_here
BRAVE_API_KEY=your_brave_api_key_here
```

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

**Encryption:** Frontend encrypts query with libsodium `crypto_secretbox_easy`, base64-encodes result

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
3. Verify base64 variant matches (ORIGINAL vs URLSAFE)
4. Check logs for [7c] line showing actual decrypted value

## Current Status

**Version:** a15fa8bc-b516-4568-993d-b58b47c437bd  
**Deployed:** March 15, 2026  
**Status:** ✅ Working  
**URL:** https://metah4-backend.metah4-backend.workers.dev

### Resolution
Replaced `libsodium-wrappers` (WASM-based, incompatible with Workers runtime) with `tweetnacl` (pure JS NaCl). Same `crypto_secretbox` algorithm — no frontend changes required.

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
