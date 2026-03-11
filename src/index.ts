import { default as sodium } from 'libsodium-wrappers'

// CRITICAL: Store ready promise in global scope (not await here - that's disallowed)
// Then await inside the handler. This is the correct pattern for Cloudflare Workers.
const sodiumReady = sodium.ready

type WorkerEnv = Env & {
	SHARED_SECRET?: string;
	BRAVE_API_KEY?: string;
};

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }

    // Try to ensure sodium is ready with aggressive timeout
    // Workers environment may not properly resolve sodium.ready promise
    try {
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Sodium init timeout')), 100)
      )
      await Promise.race([sodiumReady, timeout])
      console.log('[0] Sodium ready via await')
    } catch (e) {
      // If timeout or error, sodium might still be usable - we'll catch crypto errors later
      console.log('[0] Sodium await bypassed:', e instanceof Error ? e.message : String(e))
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
    let secretKey
    try {
      secretKey = sodium.from_hex(env.SHARED_SECRET)
      console.log('[3b] Secret key converted, length:', secretKey.length)
    } catch (e) {
      console.log('[3c] Secret key conversion failed:', e instanceof Error ? e.message : String(e))
      return new Response(JSON.stringify({ error: 'Invalid SHARED_SECRET format' }), { status: 500, headers: corsHeaders })
    }

    console.log('[4] Decoding base64...')
    let combined
    try {
      combined = sodium.from_base64(q, sodium.base64_variants.ORIGINAL)
      console.log('[4b] Base64 decode success, length:', combined.length)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.log('[4c] Base64 decode fail:', message)
      return new Response(JSON.stringify({ error: 'Invalid base64 encoding' }), { status: 400, headers: corsHeaders })
    }

    if (combined.length < sodium.crypto_secretbox_NONCEBYTES + 1) {
      console.log('[4d] Payload too short for nonce + ciphertext:', combined.length)
      return new Response(JSON.stringify({ error: 'Payload too short' }), { status: 400, headers: corsHeaders })
    }

    console.log('[5] Extracting nonce and ciphertext...')
    const nonce = combined.subarray(0, sodium.crypto_secretbox_NONCEBYTES)
    const ciphertext = combined.subarray(sodium.crypto_secretbox_NONCEBYTES)
    console.log('[5b] Nonce length:', nonce.length, 'Ciphertext length:', ciphertext.length)

    console.log('[6] Decrypting...')
    let plain
    try {
      plain = sodium.crypto_secretbox_open_easy(ciphertext, nonce, secretKey)
      console.log('[6b] Decrypt success, plain length:', plain.length)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.log('[6c] Decrypt FAILED:', message)
      return new Response(JSON.stringify({ error: 'Decryption failed - wrong key or corrupted data' }), { status: 400, headers: corsHeaders })
    }

    console.log('[7] Converting to string...')
    let decrypted
    try {
      decrypted = sodium.to_string(plain)
      console.log('[7b] String conversion success, query length:', decrypted.length)
      console.log('[7c] 🔍 DECRYPTED QUERY:', decrypted)
      console.log('[7d] First 50 chars:', decrypted.substring(0, 50))
    } catch (e) {
      console.log('[7e] to_string fail:', e instanceof Error ? e.message : String(e))
      return new Response(JSON.stringify({ error: 'String conversion failed' }), { status: 400, headers: corsHeaders })
    }

    if (!decrypted || decrypted.trim() === '') {
      console.log('[7f] Decrypted query is empty')
      return new Response(JSON.stringify({ error: 'Decrypted query is empty' }), { status: 400, headers: corsHeaders })
    }

    console.log('[8] Preparing Brave API request...')
    let braveRes
    try {
      const decryptedQuery = decrypted.trim()
      const braveUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(decryptedQuery)}&count=10`
      console.log('[8b] Fetching Brave URL')

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
      console.log('[8c] Brave response status:', braveRes.status)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.log('[8d] Brave fetch fail:', message)
      return new Response(JSON.stringify({ error: 'Brave API call failed or timed out' }), { status: 502, headers: corsHeaders })
    }

    console.log('[9] Reading response body...')
    let braveBody
    try {
      const bodyPromise = braveRes.text()
      const bodyTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Body Read Timeout')), 3000))
      braveBody = await Promise.race([bodyPromise, bodyTimeout]) as string
      console.log('[9b] Body read success, length:', braveBody.length)
    } catch (e) {
      console.log('[9c] Brave body read fail:', e instanceof Error ? e.message : String(e))
      return new Response(JSON.stringify({ error: 'Failed to read response body' }), { status: 502, headers: corsHeaders })
    }

    return new Response(braveBody, {
      status: braveRes.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
}
