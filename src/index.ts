import sodium from 'libsodium-wrappers';

declare const SHARED_SECRET: string | undefined;
declare const BRAVE_API_KEY: string | undefined;

const env = {
	SHARED_SECRET,
	BRAVE_API_KEY,
};

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

addEventListener('fetch', (event) => {
	event.respondWith(handleRequest(event.request));
});

async function handleRequest(request: Request): Promise<Response> {
	const { searchParams } = new URL(request.url);

	if (request.method === 'OPTIONS') {
		return new Response(null, { headers: corsHeaders });
	}

	if (request.method !== 'GET') {
		return new Response('Method not allowed', { status: 405 });
	}

	const q = searchParams.get('q');
	if (!q) {
		return new Response(JSON.stringify({ error: 'Missing q' }), {
			status: 400,
			headers: {
				'Content-Type': 'application/json',
				...corsHeaders,
			},
		});
	}

	await sodium.ready;
	const secretHex = env.SHARED_SECRET;
	if (!secretHex) {
		return new Response(JSON.stringify({ error: 'Missing encryption key' }), {
			status: 500,
			headers: {
				'Content-Type': 'application/json',
				...corsHeaders,
			},
		});
	}
	const secretKey = sodium.from_hex(secretHex);
	if (!secretKey) {
		return new Response(JSON.stringify({ error: 'Missing encryption key' }), {
			status: 500,
			headers: {
				'Content-Type': 'application/json',
				...corsHeaders,
			},
		});
	}

	let combined: Uint8Array;
	try {
		combined = sodium.from_base64(q, sodium.base64_variants.ORIGINAL);
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid base64' }), {
			status: 400,
			headers: {
				'Content-Type': 'application/json',
				...corsHeaders,
			},
		});
	}

	const nonce = combined.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
	const ciphertext = combined.subarray(sodium.crypto_secretbox_NONCEBYTES);

	let plain: Uint8Array;
	try {
		plain = sodium.crypto_secretbox_open_easy(ciphertext, nonce, secretKey);
	} catch {
		return new Response(JSON.stringify({ error: 'Decryption failed' }), {
			status: 400,
			headers: {
				'Content-Type': 'application/json',
				...corsHeaders,
			},
		});
	}

	const decrypted = sodium.to_string(plain);
	console.log('Decrypted query:', decrypted);

	const braveRes = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(decrypted)}&count=10`, {
		headers: { 'X-Subscription-Token': env.BRAVE_API_KEY || '' },
	});
	const braveBody = await braveRes.text();

	return new Response(braveBody, {
		status: braveRes.status,
		headers: {
			'Content-Type': 'application/json',
			...corsHeaders,
		},
	});
}
