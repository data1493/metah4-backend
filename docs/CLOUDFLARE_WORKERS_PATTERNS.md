# Cloudflare Workers: Critical Patterns & Gotchas

## Purpose
Document hard-won lessons specific to Cloudflare Workers runtime that differ from standard Node.js/browser patterns.

## libsodium-wrappers Initialization

### ❌ WRONG Patterns

```typescript
// WRONG 1: Await in global scope
import sodium from 'libsodium-wrappers'
await sodium.ready  // ❌ Error: "Disallowed operation called within global scope"

// WRONG 2: No initialization
import sodium from 'libsodium-wrappers'
export default {
  async fetch() {
    const key = sodium.from_hex('...')  // ❌ Error: "Cannot read properties of undefined (reading '_malloc')"
  }
}

// WRONG 3: Await in handler without storing promise
import sodium from 'libsodium-wrappers'
export default {
  async fetch() {
    await sodium.ready  // ❌ Causes "Promise will never complete" runtime hangs
  }
}
```

### ❌ libsodium-wrappers: INCOMPATIBLE WITH CLOUDFLARE WORKERS

**Critical Finding (March 11, 2026):** libsodium-wrappers cannot be reliably initialized in Cloudflare Workers.

All patterns tested and failed:

```typescript
// PATTERN 1: Await in global scope
import sodium from 'libsodium-wrappers'
await sodium.ready  // ❌ "Disallowed operation called within global scope"

// PATTERN 2: No initialization
import sodium from 'libsodium-wrappers'
export default {
  async fetch() {
    const key = sodium.from_hex('...')  // ❌ "Cannot read properties of undefined (reading '_malloc')"
  }
}

// PATTERN 3: Store promise, await in handler
const sodiumReady = sodium.ready
export default {
  async fetch() {
    await sodiumReady  // ❌ "Promise will never complete"
  }
}

// PATTERN 4: Promise.race with timeout
const sodiumReady = sodium.ready
export default {
  async fetch() {
    await Promise.race([sodiumReady, timeout])  // ❌ STILL "Promise will never complete"
  }
}
```

**Root Cause:** Workers runtime detects ANY await of `sodium.ready` as problematic, even when wrapped in Promise.race. The promise reference itself appears incompatible.

**Alternative Libraries for Cloudflare Workers:**

1. **@stablelib/xchacha20poly1305** (Recommended)
   - Pure JavaScript, no WASM
   - Works immediately without initialization
   ```typescript
   import { XChaCha20Poly1305 } from '@stablelib/xchacha20poly1305'
   const cipher = new XChaCha20Poly1305(key)
   const plaintext = cipher.open(nonce, ciphertext)
   ```

2. **Web Crypto API** (Built-in)
   - AES-GCM instead of XChaCha20-Poly1305
   - Different encryption scheme (requires frontend change)
   ```typescript
   const key = await crypto.subtle.importKey(...)
   const plaintext = await crypto.subtle.decrypt(...)
   ```

3. **tweetnacl-js** (Lighter alternative)
   - Pure JS implementation of NaCl
   - May work without WASM initialization issues

## Async I/O Restrictions

### Global Scope Prohibitions
These operations are **forbidden in global scope**:
- `await` on any promise
- `fetch()`
- `setTimeout()` / `setInterval()`
- Random value generation
- Any WebSocket operations

### Solution
Move all async operations inside handler functions:
```typescript
// ❌ WRONG
const data = await fetch('https://api.example.com')

// ✅ CORRECT
export default {
  async fetch() {
    const data = await fetch('https://api.example.com')
  }
}
```

## Timeouts & Hangs

### Worker Timeout Limits
- Workers have a **10-second CPU time limit** per request
- Runtime will kill hung workers automatically
- You cannot extend this timeout

### Best Practices
1. **Always use AbortController for external fetches:**
```typescript
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 8000)
const response = await fetch(url, { signal: controller.signal })
clearTimeout(timeout)
```

2. **Add timeouts to body reads:**
```typescript
const bodyPromise = response.text()
const timeout = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Body read timeout')), 3000)
)
const body = await Promise.race([bodyPromise, timeout])
```

3. **Validate input sizes early:**
```typescript
if (inputLength > 10000) {
  return new Response('Input too large', { status: 400 })
}
```

## Module Format

### Required Format
- Must use ES Module format with `export default` handler
- Configure in `wrangler.jsonc`: `"main": "src/index.ts"`

```typescript
// ✅ CORRECT
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // handler code
  }
}

// ❌ WRONG (Service Worker format)
addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})
```

## Environment Variables & Secrets

### Local Development (.env)
- `.env` file is used for local development only
- Format: `VARIABLE_NAME=value`
- Loaded automatically by `wrangler dev`

### Production Secrets
- **Never commit secrets to wrangler.jsonc**
- Use `wrangler secret put` command:
```bash
npx wrangler secret put SHARED_SECRET
npx wrangler secret put BRAVE_API_KEY
```
- Secrets persist across deployments
- Cannot be read back once set (security feature)

### Accessing in Code
```typescript
type WorkerEnv = Env & {
  SHARED_SECRET?: string
  BRAVE_API_KEY?: string
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (!env.SHARED_SECRET) {
      return new Response('Missing secret', { status: 500 })
    }
    // Use env.SHARED_SECRET
  }
}
```

## Debugging

### Log Viewing
```bash
npx wrangler tail
```
- Shows real-time logs from production
- `console.log()` statements appear here
- Numbered logging helps track execution flow

### Common Patterns
```typescript
console.log('[1] Step description')
console.log('[2] Next step')
// Helps identify where hangs/errors occur
```

## CORS Headers

### Always include for browser requests:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

// Handle preflight
if (request.method === 'OPTIONS') {
  return new Response(null, { headers: corsHeaders })
}

// Include in all responses
return new Response(data, { headers: corsHeaders })
```

## Summary of Hard Lessons

1. **libsodium initialization**: Store promise globally, await in handler
2. **No async in global scope**: Move all async ops inside handlers
3. **Timeout everything**: AbortController + Promise.race for safety
4. **Use ES Modules**: Not Service Worker format
5. **Production secrets**: `wrangler secret put`, never in config
6. **Debug with logs**: `wrangler tail` + numbered logging

---

Last Updated: March 11, 2026
