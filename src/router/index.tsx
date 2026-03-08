import React, { Suspense, lazy } from 'react';
import { createHashRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from '../context/AuthContext';
import styles from '../App.module.scss';
import { appRoutes, AppRoute } from './routes';

const LoginPage = lazy(() => import('../pages/LoginPage'));
const AdminLayout = lazy(() => import('../pages/admin/AdminLayout'));
const AdminConsolePage = lazy(() => import('../pages/admin/AdminConsolePage'));
const AdminDataPage = lazy(() => import('../pages/admin/AdminDataPage'));

const AppShell: React.FC = () => {
	const { t } = useTranslation();

	return (
		<Suspense fallback={<div className={styles.loadingState}>{t('app.loading', { defaultValue: '加载中...' })}</div>}>
			<Outlet />
		</Suspense>
	);
};

const ProtectedRoute: React.FC = () => {
	const { isAuthenticated, isLoading } = useAuth();
	const { t } = useTranslation();

	if (isLoading) {
		return (
			<div className={styles.loadingState}>
				{t('app.loading', { defaultValue: '加载中...' })}
			</div>
		);
	}

	if (!isAuthenticated) {
		return <Navigate to={appRoutes.login} replace />;
	}

	return <Outlet />;
};

const LoginRoute: React.FC = () => <LoginPage />;
const AdminLayoutRoute: React.FC = () => <AdminLayout />;
const AdminConsoleRoute: React.FC = () => <AdminConsolePage />;
const AdminDataRoute: React.FC = () => <AdminDataPage />;

export const appRouter = createHashRouter([
	{
		element: <AppShell />,
		children: [
			{
				path: appRoutes.login,
				element: <LoginRoute />,
			},
			{
				element: <ProtectedRoute />,
				children: [
					{
						path: appRoutes.admin,
						element: <AdminLayoutRoute />,
						children: [
							{
								index: true,
								element: <AdminConsoleRoute />,
							},
							{
								path: 'data',
								element: <AdminDataRoute />,
							},
						],
					},
				],
			},
			{
				path: '/',
				element: <Navigate to={appRoutes.admin} replace />,
			},
			{
				path: '*',
				element: <Navigate to={appRoutes.admin} replace />,
			},
		],
	},
]);

export const navigateToRoute = (to: AppRoute, options?: { replace?: boolean }) => appRouter.navigate(to, options);

export const AppRouterProvider: React.FC = () => (
	<AuthProvider>
		<RouterProvider router={appRouter} />
	</AuthProvider>
);
