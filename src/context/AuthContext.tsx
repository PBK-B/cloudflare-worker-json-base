import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import axios from 'axios';
import i18n from '../i18n';
import { ApiResponse } from '../types';

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

	const testConnection = useCallback(async (key?: string): Promise<ApiResponse<any>> => {
		const apiKeyToUse = key !== undefined ? key : apiKey;
		
		if (!apiKeyToUse.trim()) {
			return {
				success: false,
				error: i18n.t('auth.apiKeyRequired', { defaultValue: "API Key 不能为空" }),
				timestamp: new Date().toISOString()
			};
		}
		try {
			const response = await axios.get('/._jsondb_/api/health', {
				headers: {
					'Authorization': `Bearer ${apiKeyToUse}`
				}
			});
			
			if (response.data.data?.apiKey?.valid) {
				return {
					success: true,
					message: i18n.t('auth.apiKeyValid', { defaultValue: "API Key 有效" }),
					timestamp: new Date().toISOString(),
					data: response.data.data
				};
			}
			
			return {
				success: false,
				error: i18n.t('auth.apiKeyInvalidRetry', { defaultValue: "API Key 无效，请检查后重试" }),
				timestamp: new Date().toISOString()
			};
		} catch (error) {
			if (axios.isAxiosError(error)) {
				const statusCode = error.response?.status;
				
				if (statusCode === 401 || statusCode === 403) {
					return {
						success: false,
						error: i18n.t('auth.apiKeyInvalidRetry', { defaultValue: "API Key 无效，请检查后重试" }),
						timestamp: new Date().toISOString(),
					};
				}
				
				if (statusCode === 404) {
					return {
						success: false,
						error: i18n.t('auth.apiNotFound', { defaultValue: "API 接口不存在，请确认服务地址是否正确" }),
						timestamp: new Date().toISOString(),
					};
				}
				
				if (statusCode === 429) {
					return {
						success: false,
						error: i18n.t('auth.tooManyRequests', { defaultValue: "请求过于频繁，请稍后再试" }),
						timestamp: new Date().toISOString(),
					};
				}
				
				if (statusCode && statusCode >= 500) {
					return {
						success: false,
						error: i18n.t('auth.serverUnavailable', { defaultValue: "服务器暂时无法访问，请稍后再试" }),
						timestamp: new Date().toISOString(),
					};
				}
				
				return {
					success: false,
					error: error.response?.data?.error || i18n.t('auth.requestFailed', { defaultValue: "请求失败 ({{status}})", status: statusCode || 'unknown' }),
					timestamp: new Date().toISOString(),
				};
			}
			
			if (error instanceof Error && error.message.includes('Network Error')) {
				return {
					success: false,
					error: i18n.t('auth.networkError', { defaultValue: "无法连接到服务器，请检查网络连接或服务地址" }),
					timestamp: new Date().toISOString(),
				};
			}
			
			return {
				success: false,
				error: i18n.t('auth.unknownErrorRetry', { defaultValue: "未知错误，请稍后重试" }),
				timestamp: new Date().toISOString(),
			};
		}
	}, [apiKey]);

	const login = useCallback(async (key: string): Promise<{ success: boolean; error?: string }> => {
		setIsLoading(true);
		setApiKey(key);

		const response = await testConnection(key);

		if (response.success) {
			localStorage.setItem('jsonbase-verified', 'true');
			setIsAuthenticated(true);
			setIsLoading(false);
			return { success: true };
		} else {
			localStorage.removeItem('jsonbase-verified');
			setIsAuthenticated(false);
			setIsLoading(false);
			return { success: false, error: response.error };
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
