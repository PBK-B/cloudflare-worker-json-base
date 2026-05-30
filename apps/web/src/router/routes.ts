export const appRoutes = {
	login: '/login',
	admin: '/admin',
	adminData: '/admin/data',
	adminPermissions: '/admin/permissions',
} as const;

export type AppRoute = (typeof appRoutes)[keyof typeof appRoutes];
