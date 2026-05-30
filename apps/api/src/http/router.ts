import { joinRoute } from '@jsonbase/shared';
import type { RequestContext } from '../bootstrap/createRequestContext';
import { consoleConfigController, consoleController, consoleStatsController } from './controllers/consoleController';
import { healthController } from './controllers/healthController';
import { adminResourceController } from './controllers/adminResourceController';
import { permissionController } from './controllers/permissionController';
import { resourceController } from './controllers/resourceController';
import { AppError } from '../shared/errors/appError';
import { errorPresenter } from './presenters/errorPresenter';

export async function router(context: RequestContext): Promise<Response> {
	const pathname = context.url.pathname;
	const { apiBasePath, resourceBasePath, webBasePath } = context.container.config;
	const routes = {
		health: joinRoute(apiBasePath, 'health'),
		adminConsole: joinRoute(apiBasePath, 'admin/console'),
		adminConsoleStats: joinRoute(apiBasePath, 'admin/console/stats'),
		adminConsoleConfig: joinRoute(apiBasePath, 'admin/console/config'),
		adminResources: joinRoute(apiBasePath, 'admin/resources'),
		adminPermissionRules: joinRoute(apiBasePath, 'admin/permissions/rules'),
		adminPermissionEvaluate: joinRoute(apiBasePath, 'admin/permissions/evaluate')
	};

	try {
		await context.container.resourceService.initialize();
		await context.container.permissionService.initialize();

		if (pathname === routes.health) {
			return healthController(context);
		}

		if (pathname === routes.adminConsole) {
			return consoleController(context);
		}

		if (pathname === routes.adminConsoleStats) {
			return await consoleStatsController(context);
		}

		if (pathname === routes.adminConsoleConfig) {
			return consoleConfigController(context);
		}

		if (pathname.startsWith(routes.adminResources)) {
			const resourcePath = pathname.slice(routes.adminResources.length) || '/';
			return await adminResourceController(context, resourcePath);
		}

		if (pathname.startsWith(routes.adminPermissionRules) || pathname === routes.adminPermissionEvaluate) {
			return permissionController(context);
		}

		if (pathname.startsWith(apiBasePath)) {
			throw AppError.notFound();
		}

		if (pathname === webBasePath || pathname.startsWith(`${webBasePath}/`)) {
			throw AppError.notFound();
		}

		if (pathname === resourceBasePath || pathname.startsWith(`${resourceBasePath}/`)) {
			const resourcePath = pathname.slice(resourceBasePath.length) || '/';
			return await resourceController(context, resourcePath);
		}

		throw AppError.notFound();
	} catch (error) {
		return errorPresenter(error);
	}
}
