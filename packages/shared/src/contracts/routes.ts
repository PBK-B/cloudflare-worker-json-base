export const WEB_BASE_PATH = '/dash';
export const SYSTEM_API_BASE_PATH = '/._jsondb_/api';
export const RESOURCE_API_BASE_PATH = '';

export function joinRoute(basePath: string, routePath = ''): string {
	const normalizedBase = normalizeBasePath(basePath);
	const normalizedRoute = routePath ? `/${routePath.replace(/^\/+/, '')}` : '';
	return `${normalizedBase}${normalizedRoute}` || '/';
}

export function normalizeBasePath(path: string): string {
	const trimmed = path.trim();

	if (!trimmed || trimmed === '/') {
		return '';
	}

	return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

export const apiRoutes = {
	health: joinRoute(SYSTEM_API_BASE_PATH, 'health'),
	adminConsole: joinRoute(SYSTEM_API_BASE_PATH, 'admin/console'),
	adminConsoleStats: joinRoute(SYSTEM_API_BASE_PATH, 'admin/console/stats'),
	adminConsoleConfig: joinRoute(SYSTEM_API_BASE_PATH, 'admin/console/config'),
	adminResources: joinRoute(SYSTEM_API_BASE_PATH, 'admin/resources'),
	adminPermissionRules: joinRoute(SYSTEM_API_BASE_PATH, 'admin/permissions/rules'),
	adminPermissionEvaluate: joinRoute(SYSTEM_API_BASE_PATH, 'admin/permissions/evaluate'),
	resources: ''
} as const;

export const webRoutes = {
	login: '/login',
	admin: '/admin',
	resources: '/admin/resources',
	permissions: '/admin/permissions'
} as const;
