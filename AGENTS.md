# Metah4 Backend - Privacy Proxy

A Cloudflare Worker that proxies search requests to Brave Search API for privacy-focused querying.

## Project Status

- ✅ **Worker Implemented**: TypeScript Cloudflare Worker handling GET /search endpoint
- ✅ **Brave API Integration**: Forwards queries to https://api.search.brave.com/res/v1/web/search
- ✅ **CORS Enabled**: Access-Control-Allow-Origin: '*'
- ✅ **Error Handling**: 500 responses for missing API key or Brave failures
- ✅ **Privacy Focused**: No logging, hashed queries from frontend
- ✅ **Deployed**: Live at https://metah4-backend.metah4-backend.workers.dev
- ✅ **Secrets Configured**: BRAVE_API_KEY set via Wrangler

## API Endpoint

```
GET https://metah4-backend.metah4-backend.workers.dev/search?q=<hashed_query>
```

- **Method**: GET
- **Query Param**: `q` (URL-encoded search query)
- **Response**: JSON from Brave Search API
- **CORS**: Enabled for all origins
- **Errors**: 404 for invalid paths, 500 for API issues

## Implementation Details

- **src/index.ts**: Main worker logic
- **Environment**: BRAVE_API_KEY secret required
- **Headers**: X-Subscription-Token for Brave API auth
- **Limits**: count=10 results per query

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
