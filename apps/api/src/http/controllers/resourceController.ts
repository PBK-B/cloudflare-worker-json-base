import { requireAuth } from '../middleware/auth';
import { enforceRateLimit } from '../middleware/rateLimit';
import { adminResourcePresenter, publicResourcePresenter, resourceListPresenter } from '../presenters/resourcePresenter';
import type { RequestContext } from '../../bootstrap/createRequestContext';
import { AppError } from '../../shared/errors/appError';

export async function resourceController(context: RequestContext, resourcePath: string): Promise<Response> {
	const method = context.request.method.toUpperCase();

	if (method === 'GET' || method === 'HEAD') {
		await enforcePermission(context, resourcePath, 'read');
		const resource = await context.container.resourceService.get(resourcePath);
		return publicResourcePresenter(resource, method);
	}

	await enforcePermission(context, resourcePath, 'write');
	await enforceRateLimit(context, { limit: 100, windowSeconds: 3600 });
	const input = await parseMutationInput(context.request);

	if (method === 'POST') {
		const created = await context.container.resourceService.create(resourcePath, input);
		return publicResourcePresenter(created, 'GET');
	}

	if (method === 'PUT') {
		const updated = await context.container.resourceService.update(resourcePath, input);
		return publicResourcePresenter(updated, 'GET');
	}

	if (method === 'DELETE') {
		await context.container.resourceService.delete(resourcePath);
		return new Response(null, { status: 204 });
	}

	throw AppError.methodNotAllowed();
}

export async function adminResourceController(context: RequestContext, resourcePath: string): Promise<Response> {
	requireAuth(context);
	await enforceRateLimit(context, { limit: 200, windowSeconds: 3600 });
	const method = context.request.method.toUpperCase();

	if ((resourcePath === '/' || resourcePath === '') && method === 'GET') {
		const searchParams = context.url.searchParams;
		const result = await context.container.resourceService.list({
			prefix: searchParams.get('prefix') || undefined,
			search: searchParams.get('search') || undefined,
			page: Number(searchParams.get('page') || '1'),
			limit: Number(searchParams.get('limit') || '20'),
			sort: toSortField(searchParams.get('sort')),
			order: searchParams.get('order') === 'asc' ? 'asc' : 'desc'
		});
		return resourceListPresenter(result);
	}

	if (method === 'GET') {
		const resource = await context.container.resourceService.get(resourcePath);
		return adminResourcePresenter(resource);
	}

	const input = await parseMutationInput(context.request);

	if (method === 'POST') {
		const created = await context.container.resourceService.create(resourcePath, input);
		return adminResourcePresenter(created);
	}

	if (method === 'PUT') {
		const updated = await context.container.resourceService.update(resourcePath, input);
		return adminResourcePresenter(updated);
	}

	if (method === 'DELETE') {
		await context.container.resourceService.delete(resourcePath);
		return new Response(null, { status: 204 });
	}

	throw AppError.methodNotAllowed();
}

async function enforcePermission(context: RequestContext, resourcePath: string, action: 'read' | 'write'): Promise<void> {
	const requiresAuthentication = await context.container.permissionService.requiresAuthentication(resourcePath, action);
	if (requiresAuthentication) {
		requireAuth(context);
	}
}

async function parseMutationInput(request: Request): Promise<{
	value: unknown;
	type?: 'json' | 'text' | 'binary';
	contentType?: string;
}> {
	const contentType = request.headers.get('Content-Type') || '';

	if (contentType.includes('multipart/form-data')) {
		const formData = await request.formData();
		const file = formData.get('file');
		if (!isMultipartFileLike(file)) {
			throw AppError.badRequest('multipart/form-data requires a file field');
		}

		return {
			value: new Uint8Array(await file.arrayBuffer()),
			type: 'binary',
			contentType: file.type || 'application/octet-stream'
		};
	}

	if (contentType.includes('application/json')) {
		const body = (await request.json()) as { value?: unknown; type?: 'json' | 'text' | 'binary'; contentType?: string } | unknown;
		if (body && typeof body === 'object' && ('value' in body || 'type' in body || 'contentType' in body)) {
			const typedBody = body as { value?: unknown; type?: 'json' | 'text' | 'binary'; contentType?: string };
			return {
				value: typedBody.value,
				type: typedBody.type,
				contentType: typedBody.contentType
			};
		}

		return { value: body, type: 'json', contentType: 'application/json' };
	}

	const text = await request.text();
	return {
		value: text,
		type: 'text',
		contentType: contentType || 'text/plain'
	};
}

function isMultipartFileLike(value: unknown): value is { arrayBuffer: () => Promise<ArrayBuffer>; type?: string } {
	return Boolean(
		value &&
		typeof value === 'object' &&
		'arrayBuffer' in value &&
		typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
	);
}

function toSortField(value: string | null): 'path' | 'size' | 'updatedAt' {
	if (value === 'path') {
		return 'path';
	}

	if (value === 'size') {
		return 'size';
	}

	return 'updatedAt';
}
