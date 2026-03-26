import nacl from 'tweetnacl'

// tweetnacl is pure JS — no WASM, no async initialization needed

type WorkerEnv = Env & {
	SHARED_SECRET?: string;
	BRAVE_API_KEY?: string;
};

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string length')
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return arr
}

function fromBase64(b64: string): Uint8Array {
  // Normalize URL-safe base64 to standard, then decode
  const standard = b64.replace(/-/g, '+').replace(/_/g, '/')
  const padded = standard + '='.repeat((4 - standard.length % 4) % 4)
  const binary = atob(padded)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return arr
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 })
    }

    const url = new URL(request.url)
    const q = url.searchParams.get('q')

    if (!q) {
      return new Response(JSON.stringify({ error: 'Missing q' }), { status: 400, headers: corsHeaders })
    }

    console.log('[1] Query param received, length:', q.length)
    console.log('[1b] First 30 chars of q:', q.substring(0, 30))

    if (q.length > 10000) {
      console.log('[1c] Query too long:', q.length)
      return new Response(JSON.stringify({ error: 'Query too long' }), { status: 400, headers: corsHeaders })
    }

    if (!env.SHARED_SECRET) {
      console.log('[2] SHARED_SECRET is missing!')
      return new Response(JSON.stringify({ error: 'Missing SHARED_SECRET' }), { status: 500, headers: corsHeaders })
    }

    console.log('[3] Converting secret key...')
    let secretKey: Uint8Array
    try {
      secretKey = fromHex(env.SHARED_SECRET)
      console.log('[3b] Secret key converted, length:', secretKey.length)
      if (secretKey.length !== nacl.secretbox.keyLength) {
        throw new Error(`Key must be ${nacl.secretbox.keyLength} bytes, got ${secretKey.length}`)
      }
    } catch (e) {
      console.log('[3c] Secret key conversion failed:', e instanceof Error ? e.message : String(e))
      return new Response(JSON.stringify({ error: 'Invalid SHARED_SECRET format' }), { status: 500, headers: corsHeaders })
    }

    console.log('[4] Decoding base64...')
    let combined: Uint8Array
    try {
      combined = fromBase64(q)
      console.log('[4b] Base64 decode success, length:', combined.length)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.log('[4c] Base64 decode fail:', message)
      return new Response(JSON.stringify({ error: 'Invalid base64 encoding' }), { status: 400, headers: corsHeaders })
    }

    const NONCE_BYTES = nacl.secretbox.nonceLength // 24
    if (combined.length < NONCE_BYTES + 1) {
      console.log('[4d] Payload too short for nonce + ciphertext:', combined.length)
      return new Response(JSON.stringify({ error: 'Payload too short' }), { status: 400, headers: corsHeaders })
    }

    console.log('[5] Extracting nonce and ciphertext...')
    const nonce = combined.subarray(0, NONCE_BYTES)
    const ciphertext = combined.subarray(NONCE_BYTES)
    console.log('[5b] Nonce length:', nonce.length, 'Ciphertext length:', ciphertext.length)

    console.log('[6] Decrypting...')
    let plain: Uint8Array | null
    try {
      plain = nacl.secretbox.open(ciphertext, nonce, secretKey)
      if (plain === null) {
        console.log('[6c] Decrypt FAILED: authentication failed (wrong key or corrupted data)')
        return new Response(JSON.stringify({ error: 'Decryption failed - wrong key or corrupted data' }), { status: 400, headers: corsHeaders })
      }
      console.log('[6b] Decrypt success, plain length:', plain.length)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.log('[6c] Decrypt FAILED:', message)
      return new Response(JSON.stringify({ error: 'Decryption failed' }), { status: 400, headers: corsHeaders })
    }

    console.log('[7] Converting to string...')
    let decrypted: string
    try {
      decrypted = new TextDecoder().decode(plain)
      console.log('[7b] String conversion success, query length:', decrypted.length)
    } catch (e) {
      console.log('[7e] decode fail:', e instanceof Error ? e.message : String(e))
      return new Response(JSON.stringify({ error: 'String conversion failed' }), { status: 400, headers: corsHeaders })
    }

    if (!decrypted || decrypted.trim() === '') {
      console.log('[7f] Decrypted query is empty')
      return new Response(JSON.stringify({ error: 'Decrypted query is empty' }), { status: 400, headers: corsHeaders })
    }

    const country = url.searchParams.get('country')
    const city = url.searchParams.get('city')

    console.log('[8] Fetching Brave API...')
    let braveRes: Response
    try {
      const decryptedQuery = decrypted.trim()
      const finalQuery = city ? `${decryptedQuery} near ${city}` : decryptedQuery
      const braveParams = new URLSearchParams({ q: finalQuery, count: '10' })
      if (country) braveParams.set('country', country)
      if (city) braveParams.set('city', city)
      const braveUrl = `https://api.search.brave.com/res/v1/web/search?${braveParams.toString()}`

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      braveRes = await fetch(braveUrl, {
        headers: {
          'X-Subscription-Token': env.BRAVE_API_KEY || '',
          'Accept': 'application/json'
        },
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      console.log('[8b] Brave response status:', braveRes.status)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.log('[8c] Brave fetch fail:', message)
      return new Response(JSON.stringify({ error: 'Brave API call failed or timed out' }), { status: 502, headers: corsHeaders })
    }

    console.log('[9] Reading response body...')
    let braveBody: string
    try {
      const bodyPromise = braveRes.text()
      const bodyTimeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Body Read Timeout')), 3000))
      braveBody = await Promise.race([bodyPromise, bodyTimeout])
      console.log('[9b] Body length:', braveBody.length)
      // DIAGNOSTIC: log first 300 chars to spot moon emoji or unexpected content in raw Brave response
      console.log('[9c] Body preview:', braveBody.substring(0, 300))
    } catch (e) {
      console.log('[9d] Brave body read fail:', e instanceof Error ? e.message : String(e))
      return new Response(JSON.stringify({ error: 'Failed to read response body' }), { status: 502, headers: corsHeaders })
    }

    return new Response(braveBody, {
      status: braveRes.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
}
