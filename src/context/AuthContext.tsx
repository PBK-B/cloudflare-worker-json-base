import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import axios from 'axios';
import { ApiResponse } from '../types';

interface AuthContextType {
	isAuthenticated: boolean;
	isLoading: boolean;
	apiKey: string;
	setApiKey: (key: string) => void;
	login: (key: string) => Promise<boolean>;
	logout: () => void;
	testConnection: () => Promise<ApiResponse<any>>;
	onAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
	const [apiKey, setApiKeyState] = useState<string>('');
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const savedApiKey = localStorage.getItem('jsonbase-api-key');
		const savedVerified = localStorage.getItem('jsonbase-verified');

		if (savedApiKey && savedVerified === 'true') {
			setApiKeyState(savedApiKey);
			axios.defaults.headers.common['Authorization'] = `Bearer ${savedApiKey}`;
			setIsAuthenticated(true);
		}
		setIsLoading(false);
	}, []);

	const setApiKey = useCallback((key: string) => {
		setApiKeyState(key);
		axios.defaults.headers.common['Authorization'] = `Bearer ${key}`;
		localStorage.setItem('jsonbase-api-key', key);
	}, []);

	const testConnection = useCallback(async (): Promise<ApiResponse<any>> => {
		if (!apiKey.trim()) {
			return {
				success: false,
				error: 'API Key 不能为空',
				timestamp: new Date().toISOString()
			};
		}
		try {
			const response = await axios.get('/api/data/test');
			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					success: false,
					error: error.response?.data?.error || '连接失败',
					timestamp: new Date().toISOString(),
				};
			}
			return {
				success: false,
				error: '未知错误',
				timestamp: new Date().toISOString(),
			};
		}
	}, [apiKey]);

	const login = useCallback(async (key: string): Promise<boolean> => {
		setIsLoading(true);
		setApiKey(key);

		const response = await testConnection();

		if (response.success) {
			localStorage.setItem('jsonbase-verified', 'true');
			setIsAuthenticated(true);
			setIsLoading(false);
			return true;
		} else {
			localStorage.removeItem('jsonbase-verified');
			setIsAuthenticated(false);
			setIsLoading(false);
			return false;
		}
	}, [setApiKey, testConnection]);

	const logout = useCallback(() => {
		setApiKeyState('');
		delete axios.defaults.headers.common['Authorization'];
		localStorage.removeItem('jsonbase-api-key');
		localStorage.removeItem('jsonbase-verified');
		setIsAuthenticated(false);
	}, []);

	const onAuthError = useCallback(() => {
		logout();
	}, [logout]);

	return (
		<AuthContext.Provider
			value={{
				isAuthenticated,
				isLoading,
				apiKey,
				setApiKey,
				login,
				logout,
				testConnection,
				onAuthError,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
};

export const useAuth = (): AuthContextType => {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error('useAuth must be used within an AuthProvider');
	}
	return context;
};
