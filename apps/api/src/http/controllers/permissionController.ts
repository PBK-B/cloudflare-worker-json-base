import { jsonPresenter } from '../presenters/jsonPresenter';
import type { RequestContext } from '../../bootstrap/createRequestContext';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../../shared/errors/appError';


export async function permissionController(context: RequestContext): Promise<Response> {
	requireAuth(context);
	const pathname = context.url.pathname;
	const method = context.request.method.toUpperCase();

	if (pathname.endsWith('/evaluate') && method === 'POST') {
		const body = (await context.request.json()) as { path: string; action: 'read' | 'write' };
		const decision = await context.container.permissionService.evaluate(body);
		return jsonPresenter({ success: true, data: decision, timestamp: new Date().toISOString() });
	}

	if ((pathname.endsWith('/rules') || pathname.endsWith('/rules/')) && method === 'GET') {
		const enabledParam = context.url.searchParams.get('enabled');
		const search = context.url.searchParams.get('search') || undefined;
		const enabled = enabledParam === null ? undefined : enabledParam === 'true';
		const rules = await context.container.permissionService.listRules({ enabled, search });
		return jsonPresenter({ success: true, data: { items: rules }, timestamp: new Date().toISOString() });
	}

	if ((pathname.endsWith('/rules') || pathname.endsWith('/rules/')) && method === 'POST') {
		const body = await context.request.json();
		const rule = await context.container.permissionService.createRule(body as never);
		return jsonPresenter({ success: true, data: rule, timestamp: new Date().toISOString() }, 201);
	}

	const ruleMatch = pathname.match(/\/rules\/([^/]+)$/);
	if (ruleMatch && method === 'PUT') {
		const body = await context.request.json();
		const rule = await context.container.permissionService.updateRule(ruleMatch[1], body as never);
		return jsonPresenter({ success: true, data: rule, timestamp: new Date().toISOString() });
	}

	const statusMatch = pathname.match(/\/rules\/([^/]+)\/status$/);
	if (statusMatch && method === 'PATCH') {
		const body = (await context.request.json()) as { enabled?: boolean };
		if (typeof body.enabled !== 'boolean') {
			throw AppError.badRequest('enabled must be a boolean');
		}
		const rule = await context.container.permissionService.setRuleEnabled(statusMatch[1], body.enabled);
		return jsonPresenter({ success: true, data: rule, timestamp: new Date().toISOString() });
	}

	if (ruleMatch && method === 'DELETE') {
		await context.container.permissionService.deleteRule(ruleMatch[1]);
		return new Response(null, { status: 204 });
	}

	throw AppError.notFound('Permission endpoint not found');
}
