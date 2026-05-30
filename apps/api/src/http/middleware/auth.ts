import type { RequestContext } from '../../bootstrap/createRequestContext';
import { AppError } from '../../shared/errors/appError';

export interface AuthResult {
	apiKey: string;
	method: 'bearer' | 'query';
}

export function requireAuth(context: RequestContext): AuthResult {
	const expectedApiKey = context.container.config.apiKey;
	if (!expectedApiKey) {
		throw AppError.internal('API_KEY is not configured');
	}

	const authHeader = context.request.headers.get('Authorization');
	const queryKey = context.url.searchParams.get('key');

	let apiKey: string | null = null;
	let method: 'bearer' | 'query' = 'bearer';

	if (authHeader) {
		const match = authHeader.match(/^Bearer\s+(.+)$/i);
		if (!match) {
			throw AppError.unauthorized('Authorization header must use Bearer token format');
		}
		apiKey = match[1].trim();
		method = 'bearer';
	} else if (queryKey) {
		apiKey = queryKey.trim();
		method = 'query';
	}

	if (!apiKey) {
		throw AppError.unauthorized('API key required');
	}

	if (apiKey !== expectedApiKey) {
		throw AppError.forbidden('Invalid API key');
	}

	return { apiKey, method };
}

export function maybeAuth(context: RequestContext): AuthResult | null {
	try {
		return requireAuth(context);
	} catch (error) {
		if (error instanceof AppError && (error.statusCode === 401 || error.statusCode === 403)) {
			return null;
		}
		throw error;
	}
}
