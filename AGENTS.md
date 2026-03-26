# Metah4 Backend - Privacy Proxy

A Cloudflare Worker that decrypts frontend-encrypted queries and proxies them to Brave Search API.

## Project Status

- ✅ **Worker Implemented**: TypeScript ES Module Worker handling GET /search endpoint
- ✅ **Brave API Integration**: Forwards decrypted queries to https://api.search.brave.com/res/v1/web/search
- ✅ **Country Param**: Optional `country` param forwarded to Brave to bias results geographically (branch: `feat/location-country-param`)
- ✅ **CORS Enabled**: Access-Control-Allow-Origin: '*'
- ✅ **Error Handling**: 400 for invalid `q`, base64, or decrypt failures; 500 for missing key/secret
- ✅ **No Query Logging**: Decrypted query debug logging removed for privacy
- ✅ **Deployed**: Live at https://metah4-backend.metah4-backend.workers.dev
- ✅ **Secrets Configured**: BRAVE_API_KEY and SHARED_SECRET set via Wrangler
- ✅ **Worklog Added**: See `docs/WORKLOG.md` for issue history and known-good baseline

## API Endpoint

```
GET https://metah4-backend.metah4-backend.workers.dev/search?q=<base64_encrypted_query>[&country=<ISO-3166-1-alpha-2>]
```

- **Method**: GET
- **Query Param**: `q` (base64 of `nonce + ciphertext` encrypted via tweetnacl secretbox)
- **Query Param**: `country` (optional ISO-3166-1-alpha-2 code, e.g. `US`, `GB` — forwarded to Brave to bias results geographically)
- **Response**: JSON from Brave Search API (pass-through)
- **CORS**: Enabled for all origins
- **Errors**: 400 (`Missing q`, `Invalid base64`, `Decryption failed`), 405 for wrong method, 500 for missing secrets

## Implementation Details

- **src/index.ts**: ES Module `export default { fetch(...) }` handler
- **Crypto**: tweetnacl (pure JS NaCl secretbox — no WASM, no async init)
- **Environment**: BRAVE_API_KEY and SHARED_SECRET secrets required
- **Headers**: `X-Subscription-Token` for Brave API auth
- **Limits**: count=10 results per query
- **Timeouts**: 8-second AbortController on Brave API fetch, 3-second body read timeout
- **Validation**: Max input length 10,000 chars, comprehensive payload checks
- **Logging**: Numbered diagnostic logs ([1]-[9]) for troubleshooting
- **Tests**: 13 passing (vitest + @cloudflare/vitest-pool-workers)

# Cloudflare Workers

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

For all limits and quotas, retrieve from the product's `/platform/limits/` page. eg. `/workers/platform/limits`

## Commands

| Command | Purpose |
|---------|---------|
| `npx wrangler dev` | Local development |
| `npx wrangler deploy` | Deploy to Cloudflare |
| `npx wrangler types` | Generate TypeScript types |

Run `wrangler types` after changing bindings in wrangler.jsonc.

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from `/workers/platform/limits/`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`
