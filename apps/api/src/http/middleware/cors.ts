export function withCors(response: Response, request: Request): Response {
	const origin = request.headers.get('Origin') || '*';
	const headers = new Headers(response.headers);
	headers.set('Access-Control-Allow-Origin', origin);
	headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
	headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	headers.set('Access-Control-Max-Age', '86400');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

export function handleCorsPreflight(request: Request): Response | null {
	if (request.method !== 'OPTIONS') {
		return null;
	}

	return withCors(new Response(null, { status: 204 }), request);
}
