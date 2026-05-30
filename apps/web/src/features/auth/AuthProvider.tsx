import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import i18n from '../../i18n';
import { apiRequest } from '../../shared/api/client';
import type { ApiResponse } from '../../types';

interface AuthContextType {
	isAuthenticated: boolean;
	isLoading: boolean;
	apiKey: string;
	setApiKey: (key: string) => void;
	login: (key: string) => Promise<{ success: boolean; error?: string }>;
	logout: () => void;
	testConnection: (key?: string) => Promise<ApiResponse<any>>;
	onAuthError: () => void;
}

type HealthResponse = ApiResponse<{
	apiKey?: {
		valid: boolean;
		method?: string;
	};
}>;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
	const [apiKey, setApiKeyState] = useState('');
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	const setApiKey = useCallback((key: string) => {
		setApiKeyState(key);
		localStorage.setItem('jsonbase-api-key', key);
	}, []);

	const validateApiKey = useCallback(async (apiKeyToUse: string): Promise<ApiResponse<any>> => {
		if (!apiKeyToUse.trim()) {
			return { success: false, error: i18n.t('auth.apiKeyRequired', { defaultValue: 'API Key 不能为空' }), timestamp: new Date().toISOString() };
		}

		try {
			const response = await apiRequest<HealthResponse>('/health', {
				headers: { Authorization: `Bearer ${apiKeyToUse}` },
			});

			if (!response.data?.apiKey?.valid) {
				return { success: false, error: i18n.t('auth.apiKeyInvalid', { defaultValue: 'API Key 无效' }), timestamp: response.timestamp };
			}

			return { ...response, success: true, message: i18n.t('auth.apiKeyValid', { defaultValue: 'API Key 有效' }) };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : i18n.t('auth.unknownErrorRetry', { defaultValue: '未知错误，请稍后重试' }),
				timestamp: new Date().toISOString(),
			};
		}
	}, []);

	const testConnection = useCallback(async (key?: string): Promise<ApiResponse<any>> => {
		return validateApiKey(key !== undefined ? key : apiKey);
	}, [apiKey, validateApiKey]);

	useEffect(() => {
		const savedApiKey = localStorage.getItem('jsonbase-api-key');
		const savedVerified = localStorage.getItem('jsonbase-verified');

		if (savedApiKey && savedVerified === 'true') {
			setApiKeyState(savedApiKey);
			void validateApiKey(savedApiKey).then((response) => {
				if (response.success) {
					setIsAuthenticated(true);
					localStorage.setItem('jsonbase-verified', 'true');
				} else {
					localStorage.removeItem('jsonbase-api-key');
					localStorage.removeItem('jsonbase-verified');
					setApiKeyState('');
					setIsAuthenticated(false);
				}

				setIsLoading(false);
			});
			return;
		}

		setIsLoading(false);
	}, [validateApiKey]);

	const login = useCallback(async (key: string): Promise<{ success: boolean; error?: string }> => {
		setIsLoading(true);

		const response = await validateApiKey(key);

		if (response.success) {
			setApiKey(key);
			localStorage.setItem('jsonbase-verified', 'true');
			setIsAuthenticated(true);
			setIsLoading(false);
			return { success: true };
		}

		setApiKeyState('');
		localStorage.removeItem('jsonbase-api-key');
		localStorage.removeItem('jsonbase-verified');
		setIsAuthenticated(false);
		setIsLoading(false);
		return { success: false, error: response.error };
	}, [setApiKey, validateApiKey]);

	const logout = useCallback(() => {
		setApiKeyState('');
		localStorage.removeItem('jsonbase-api-key');
		localStorage.removeItem('jsonbase-verified');
		setIsAuthenticated(false);
	}, []);

	const onAuthError = useCallback(() => {
		logout();
	}, [logout]);

	return (
		<AuthContext.Provider value={{ isAuthenticated, isLoading, apiKey, setApiKey, login, logout, testConnection, onAuthError }}>
			{children}
		</AuthContext.Provider>
	);
};

export const useAuth = (): AuthContextType => {
	const context = useContext(AuthContext);

	if (!context) {
		throw new Error('useAuth must be used within an AuthProvider');
	}

	return context;
};
