import sodium from 'libsodium-wrappers';

async function ensureSodiumReady(timeoutMs: number): Promise<void> {
	await Promise.race([
		sodium.ready as Promise<void>,
		new Promise<void>((_, reject) => {
			setTimeout(() => reject(new Error('Sodium init timeout')), timeoutMs);
		}),
	]);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		if (request.method !== 'GET') {
			return new Response('Method not allowed', { status: 405 });
		}

		const url = new URL(request.url);
		const q = url.searchParams.get('q');
		if (!q) {
			return new Response(JSON.stringify({ error: 'Missing q' }), { status: 400, headers: corsHeaders });
		}

		try {
			await ensureSodiumReady(1500);
		} catch {
			return new Response(JSON.stringify({ error: 'Crypto init failed' }), { status: 500, headers: corsHeaders });
		}

		if (!env.SHARED_SECRET) {
			return new Response(JSON.stringify({ error: 'Missing encryption key' }), { status: 500, headers: corsHeaders });
		}

		let secretKey;
		try {
			secretKey = sodium.from_hex(env.SHARED_SECRET);
		} catch {
			return new Response(JSON.stringify({ error: 'Invalid encryption key' }), { status: 500, headers: corsHeaders });
		}

		let combined;
		try {
			combined = Uint8Array.from(atob(q), c => c.charCodeAt(0));
		} catch {
			return new Response(JSON.stringify({ error: 'Invalid base64' }), { status: 400, headers: corsHeaders });
		}

		if (combined.length < sodium.crypto_secretbox_NONCEBYTES + sodium.crypto_secretbox_MACBYTES) {
			return new Response(JSON.stringify({ error: 'Invalid encrypted data length' }), { status: 400, headers: corsHeaders });
		}

		const nonce = combined.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
		const ciphertext = combined.subarray(sodium.crypto_secretbox_NONCEBYTES);

		let plain;
		try {
			plain = sodium.crypto_secretbox_open_easy(ciphertext, nonce, secretKey);
		} catch {
			return new Response(JSON.stringify({ error: 'Decryption failed' }), { status: 400, headers: corsHeaders });
		}

		if (!plain) {
			return new Response(JSON.stringify({ error: 'Decryption failed' }), { status: 400, headers: corsHeaders });
		}

		const decrypted = sodium.to_string(plain);

		if (!env.BRAVE_API_KEY) {
			return new Response(JSON.stringify({ error: 'Brave API key missing' }), { status: 500, headers: corsHeaders });
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 8000);
		let braveRes: Response;
		try {
			braveRes = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(decrypted)}&count=10`, {
				headers: { 'X-Subscription-Token': env.BRAVE_API_KEY },
				signal: controller.signal,
			});
		} catch {
			return new Response(JSON.stringify({ error: 'Upstream request failed' }), { status: 502, headers: corsHeaders });
		} finally {
			clearTimeout(timeout);
		}

		const braveBody = await braveRes.text();

		return new Response(braveBody, {
			status: braveRes.status,
			headers: { 'Content-Type': 'application/json', ...corsHeaders },
		});
	},
};
