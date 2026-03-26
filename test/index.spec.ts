import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, it, expect, vi, afterEach } from 'vitest'
import nacl from 'tweetnacl'
import worker from '../src/index'

// ─── Test constants ──────────────────────────────────────────────────────────

// 32-byte test key (must match TEST_SHARED_SECRET in vitest.config.mts define block)
const TEST_SECRET_HEX = '0'.repeat(64) // 32 zero bytes
const TEST_SECRET_BYTES = new Uint8Array(32) // all zeros

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toBase64(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
}

/** Encrypt `plaintext` with the test key, return base64(nonce + ciphertext) */
function encryptQuery(plaintext: string): string {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const msg = new TextEncoder().encode(plaintext)
  const box = nacl.secretbox(msg, nonce, TEST_SECRET_BYTES)
  const combined = new Uint8Array(nonce.length + box.length)
  combined.set(nonce)
  combined.set(box, nonce.length)
  return toBase64(combined)
}

/** Build a WorkerEnv-alike object for unit tests */
function makeEnv(overrides: Record<string, string> = {}): typeof env {
  return {
    ...env,
    SHARED_SECRET: TEST_SECRET_HEX,
    BRAVE_API_KEY: 'test-brave-key',
    ...overrides,
  } as typeof env
}

function makeCtx(): ReturnType<typeof createExecutionContext> {
  return createExecutionContext()
}

// ─── Suites ──────────────────────────────────────────────────────────────────

describe('CORS', () => {
  it('OPTIONS preflight returns 200 with CORS headers', async () => {
    const req = new Request('http://worker/search', { method: 'OPTIONS' })
    const ctx = makeCtx()
    const res = await worker.fetch(req, makeEnv(), ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET')
  })
})

describe('Method validation', () => {
  it('rejects non-GET/OPTIONS methods with 405', async () => {
    const req = new Request('http://worker/search', { method: 'POST' })
    const ctx = makeCtx()
    const res = await worker.fetch(req, makeEnv(), ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(405)
  })
})

describe('Query parameter validation', () => {
  it('returns 400 when q is missing', async () => {
    const req = new Request('http://worker/')
    const ctx = makeCtx()
    const res = await worker.fetch(req, makeEnv(), ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Missing q')
  })

  it('returns 400 when q exceeds 10000 chars', async () => {
    const req = new Request(`http://worker/?q=${'a'.repeat(10001)}`)
    const ctx = makeCtx()
    const res = await worker.fetch(req, makeEnv(), ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Query too long')
  })

  it('returns 400 when q is invalid base64', async () => {
    const req = new Request('http://worker/?q=!!!not-base64!!!')
    const ctx = makeCtx()
    const res = await worker.fetch(req, makeEnv(), ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Invalid base64 encoding')
  })

  it('returns 400 when payload is too short (< nonce + 1 byte)', async () => {
    // Valid base64 but only 10 bytes — less than 24-byte nonce
    const tooShort = toBase64(new Uint8Array(10))
    const req = new Request(`http://worker/?q=${encodeURIComponent(tooShort)}`)
    const ctx = makeCtx()
    const res = await worker.fetch(req, makeEnv(), ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Payload too short')
  })
})

describe('Secret / crypto validation', () => {
  it('returns 500 when SHARED_SECRET is missing', async () => {
    const req = new Request(`http://worker/?q=${encodeURIComponent(encryptQuery('hello'))}`)
    const ctx = makeCtx()
    const res = await worker.fetch(req, makeEnv({ SHARED_SECRET: '' }), ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Missing SHARED_SECRET')
  })

  it('returns 400 when ciphertext was encrypted with a different key', async () => {
    const payload = encryptQuery('hello world')
    // Override with a different (all-ones) key
    const wrongKeyHex = 'f'.repeat(64)
    const req = new Request(`http://worker/?q=${encodeURIComponent(payload)}`)
    const ctx = makeCtx()
    const res = await worker.fetch(req, makeEnv({ SHARED_SECRET: wrongKeyHex }), ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/Decryption failed/)
  })
})

describe('Happy path', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('decrypts query and proxies Brave response', async () => {
    const fakeResults = { web: { results: [{ title: 'Test', url: 'https://example.com' }] } }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fakeResults), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ))

    const payload = encryptQuery('cloudflare workers')
    const req = new Request(`http://worker/?q=${encodeURIComponent(payload)}`)
    const ctx = makeCtx()
    const res = await worker.fetch(req, makeEnv(), ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const body = await res.json()
    expect(body).toEqual(fakeResults)
  })
})

describe('country param forwarding', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('forwards country param to Brave when present', async () => {
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      capturedUrl = url
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    }))

    const payload = encryptQuery('local news')
    const req = new Request(`http://worker/?q=${encodeURIComponent(payload)}&country=GB`)
    const ctx = makeCtx()
    const res = await worker.fetch(req, makeEnv(), ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    expect(capturedUrl).toContain('country=GB')
  })

  it('omits country param from Brave when not provided', async () => {
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      capturedUrl = url
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    }))

    const payload = encryptQuery('global news')
    const req = new Request(`http://worker/?q=${encodeURIComponent(payload)}`)
    const ctx = makeCtx()
    const res = await worker.fetch(req, makeEnv(), ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    expect(capturedUrl).not.toContain('country=')
  })

  it('passes country value unchanged to Brave', async () => {
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      capturedUrl = url
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    }))

    const payload = encryptQuery('ramen')
    const req = new Request(`http://worker/?q=${encodeURIComponent(payload)}&country=JP`)
    const ctx = makeCtx()
    const res = await worker.fetch(req, makeEnv(), ctx)
    await waitOnExecutionContext(ctx)

    expect(capturedUrl).toContain('country=JP')
    expect(capturedUrl).not.toContain('country=GB')
  })
})

describe('Upstream error handling', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 502 when Brave fetch throws (e.g. timeout/abort)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('The operation was aborted')))

    const payload = encryptQuery('test query')
    const req = new Request(`http://worker/?q=${encodeURIComponent(payload)}`)
    const ctx = makeCtx()
    const res = await worker.fetch(req, makeEnv(), ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(502)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Brave API call failed or timed out')
  })
})
