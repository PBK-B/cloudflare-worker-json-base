import { createContainer } from './bootstrap/createContainer';
import { createRequestContext } from './bootstrap/createRequestContext';
import { handleCorsPreflight, withCors } from './http/middleware/cors';
import { router } from './http/router';
import type { WorkerEnv } from './infrastructure/config/runtimeConfig';

export default {
	async fetch(request: Request, env: WorkerEnv): Promise<Response> {
		const preflight = handleCorsPreflight(request);
		if (preflight) {
			return preflight;
		}

		const container = createContainer(env);
		const context = createRequestContext(container, request);
		const webBasePath = container.config.webBasePath;

		if (context.url.pathname === webBasePath) {
			return Response.redirect(new URL(`${webBasePath}/`, request.url).toString(), 302);
		}

		if (context.url.pathname.startsWith(`${webBasePath}/`)) {
			const assetPath = context.url.pathname.replace(webBasePath, '') || '/';
			const assetUrl = new URL(assetPath, request.url);
			const assetResponse = await env.WEBUI.fetch(assetUrl.toString(), request);

			if (assetPath === '/' || assetPath === '/index.html') {
				return injectWebRuntimeConfig(assetResponse, container.config);
			}

			return assetResponse;
		}

		const response = await router(context);
		return withCors(response, request);
	}
};

async function injectWebRuntimeConfig(response: Response, config: { apiBasePath: string; resourceBasePath: string }): Promise<Response> {
	const contentType = response.headers.get('Content-Type') || '';

	if (!response.ok || !contentType.includes('text/html')) {
		return response;
	}

	const html = await response.text();
	const runtimeConfig = `<script>window.__JSONBASE_CONFIG__=${JSON.stringify({
		systemApiBasePath: config.apiBasePath,
		resourceBasePath: config.resourceBasePath
	})};</script>`;

	return new Response(html.replace('</head>', `${runtimeConfig}</head>`), response);
}
