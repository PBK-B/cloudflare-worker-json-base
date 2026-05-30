import { RESOURCE_API_BASE_PATH, SYSTEM_API_BASE_PATH, normalizeBasePath } from '@jsonbase/shared';

type ApiRequestOptions = RequestInit & {
	auth?: boolean;
};

export function getStoredApiKey(): string {
	return localStorage.getItem('jsonbase-api-key') || '';
}

export function getSystemApiBasePath(): string {
	return normalizeBasePath(window.__JSONBASE_CONFIG__?.systemApiBasePath || SYSTEM_API_BASE_PATH) || '/';
}

export function getResourceApiBasePath(): string {
	return normalizeBasePath(window.__JSONBASE_CONFIG__?.resourceBasePath || RESOURCE_API_BASE_PATH);
}

export async function apiRequest<T>(path: string, init?: ApiRequestOptions): Promise<T> {
	const { auth = true, headers, ...requestInit } = init || {};
	const requestHeaders = new Headers(headers);
	const apiKey = getStoredApiKey();

	if (auth && apiKey && !requestHeaders.has('Authorization')) {
		requestHeaders.set('Authorization', `Bearer ${apiKey}`);
	}

	const response = await fetch(`${getSystemApiBasePath()}${path}`, {
		...requestInit,
		headers: requestHeaders,
	});

	if (!response.ok) {
		const message = await safeReadError(response);
		throw new Error(message || `API request failed with status ${response.status}`);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
}

async function safeReadError(response: Response): Promise<string> {
	try {
		const payload = (await response.json()) as { error?: string; message?: string };
		return payload.error || payload.message || '';
	} catch {
		return '';
	}
}
