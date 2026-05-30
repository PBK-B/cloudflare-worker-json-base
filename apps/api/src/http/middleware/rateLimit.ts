import type { RequestContext } from '../../bootstrap/createRequestContext';
import { AppError } from '../../shared/errors/appError';

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

const memoryFallback = new Map<string, RateLimitEntry>();

export async function enforceRateLimit(
	context: RequestContext,
	options: { limit?: number; windowSeconds?: number } = {}
): Promise<void> {
	if (!context.container.config.rateLimitEnabled) {
		return;
	}

	const limit = options.limit ?? 100;
	const windowSeconds = options.windowSeconds ?? 3600;
	const clientIp = getClientIp(context.request);
	const now = Date.now();
	const bucket = Math.floor(now / (windowSeconds * 1000));
	const key = `rate-limit:${clientIp}:${bucket}`;
	const kv = context.container.env.JSONBIN;

	if (!kv) {
		checkEntry(memoryFallback, key, limit, windowSeconds, now);
		return;
	}

	const existing = (await kv.get(key, 'json')) as RateLimitEntry | null;
	const nextEntry = checkEntry(existing ? new Map([[key, existing]]) : new Map(), key, limit, windowSeconds, now);
	await kv.put(key, JSON.stringify(nextEntry), { expirationTtl: windowSeconds * 2 });
}

function checkEntry(
	store: Map<string, RateLimitEntry>,
	key: string,
	limit: number,
	windowSeconds: number,
	now: number
): RateLimitEntry {
	const existing = store.get(key);
	if (!existing || now > existing.resetAt) {
		const fresh = { count: 1, resetAt: now + windowSeconds * 1000 };
		store.set(key, fresh);
		return fresh;
	}

	if (existing.count >= limit) {
		throw AppError.forbidden('Rate limit exceeded');
	}

	const updated = { ...existing, count: existing.count + 1 };
	store.set(key, updated);
	return updated;
}

function getClientIp(request: Request): string {
	return (
		request.headers.get('cf-connecting-ip') ||
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		request.headers.get('x-real-ip') ||
		'unknown'
	);
}
