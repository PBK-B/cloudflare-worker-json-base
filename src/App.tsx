import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastContainer } from './utils/notification';
import styles from './App.module.scss';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminConsolePage = lazy(() => import('./pages/admin/AdminConsolePage'));
const AdminDataPage = lazy(() => import('./pages/admin/AdminDataPage'));

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const { isAuthenticated, isLoading } = useAuth();
	const { t } = useTranslation();

	if (isLoading) {
		return (
			<div className={styles.loadingState}>
				{t('app.loading', { defaultValue: "加载中..." })}
			</div>
		);
	}

	if (!isAuthenticated) {
		return <Navigate to="/login" replace />;
	}

	return <>{children}</>;
};

const AppRoutes: React.FC = () => {
	const { t } = useTranslation();

	return (
		<Suspense fallback={<div className={styles.loadingState}>{t('app.loading', { defaultValue: "加载中..." })}</div>}>
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route
					path="/admin"
					element={
						<ProtectedRoute>
							<AdminLayout />
						</ProtectedRoute>
					}
				>
					<Route index element={<AdminConsolePage />} />
					<Route path="data" element={<AdminDataPage />} />
				</Route>
				<Route path="/" element={<Navigate to="/admin" replace />} />
				<Route path="*" element={<Navigate to="/admin" replace />} />
			</Routes>
		</Suspense>
	);
};

const App: React.FC = () => {
	return (
		<HashRouter>
			<AuthProvider>
				<ToastContainer />
				<AppRoutes />
			</AuthProvider>
		</HashRouter>
	);
};

export default App;
