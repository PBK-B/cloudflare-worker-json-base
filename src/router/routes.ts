export const appRoutes = {
	login: '/login',
	admin: '/admin',
	adminData: '/admin/data',
} as const;

export type AppRoute = (typeof appRoutes)[keyof typeof appRoutes];
