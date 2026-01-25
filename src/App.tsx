import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminConsolePage from './pages/admin/AdminConsolePage';
import AdminDataPage from './pages/admin/AdminDataPage';
import { ToastContainer } from './utils/notification';
import './styles/App.less';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const { isAuthenticated, isLoading } = useAuth();

	if (isLoading) {
		return (
			<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
				加载中...
			</div>
		);
	}

	if (!isAuthenticated) {
		return <Navigate to="/login" replace />;
	}

	return <>{children}</>;
};

const AppRoutes: React.FC = () => {
	return (
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
	);
};

const App: React.FC = () => {
	return (
		<BrowserRouter>
			<AuthProvider>
				<ToastContainer />
				<AppRoutes />
			</AuthProvider>
		</BrowserRouter>
	);
};

export default App;
