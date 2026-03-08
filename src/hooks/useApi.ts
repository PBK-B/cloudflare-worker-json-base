import { useState, useEffect, useCallback } from 'react';
import axios, { AxiosError } from 'axios';
import { configure } from 'axios-hooks';
import i18n from '../i18n';
import {
	ApiResponse,
	StorageData,
	CreateDataRequest,
	UpdateDataRequest,
	PaginatedResponse,
	PermissionDecision,
	PermissionEvaluationRequest,
	PermissionRule,
	PermissionRuleInput,
} from '../types';
import { navigateToRoute } from '../router';
import { appRoutes } from '../router/routes';

const API_BASE_URL = '/._jsondb_/api';

const axiosInstance = axios.create({
	baseURL: API_BASE_URL,
	headers: {
		'Content-Type': 'application/json',
	},
});

axiosInstance.interceptors.request.use((config) => {
	const savedApiKey = localStorage.getItem('jsonbase-api-key');
	if (savedApiKey) {
		config.headers.set('Authorization', `Bearer ${savedApiKey}`);
	}

	if (config.data instanceof FormData) {
		config.headers.delete('Content-Type');
	}

	return config;
});

axiosInstance.interceptors.response.use(
	(response) => response,
	(error: AxiosError) => {
		if (error.response?.status === 401 || error.response?.status === 403) {
			localStorage.removeItem('jsonbase-verified');
			localStorage.removeItem('jsonbase-api-key');
			void navigateToRoute(appRoutes.login, { replace: true });
		}
		return Promise.reject(error);
	},
);

configure({ axios: axiosInstance });

const isCanceledError = (error: unknown) => axios.isCancel(error) || (axios.isAxiosError(error) && error.code === 'ERR_CANCELED');

export const useApi = () => {
	const [apiKey, setApiKeyState] = useState<string>('');
	const [isConfigured, setIsConfigured] = useState(false);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const savedApiKey = localStorage.getItem('jsonbase-api-key');
		if (savedApiKey) {
			setApiKeyState(savedApiKey);
			axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${savedApiKey}`;
			setIsConfigured(true);
		}
	}, []);

	const setApiKey = useCallback((key: string) => {
		setApiKeyState(key);
		axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${key}`;
		localStorage.setItem('jsonbase-api-key', key);
	}, []);

	const testConnection = useCallback(async (): Promise<ApiResponse<any>> => {
		setLoading(true);
		try {
			const response = await axiosInstance.get('/health');
			if (response.data.data?.apiKey?.valid) {
				return {
					success: true,
					message: i18n.t('api.apiKeyValid', { defaultValue: 'API Key 有效' }),
					timestamp: new Date().toISOString(),
					data: response.data.data,
				};
			}
			return {
				success: false,
				error: i18n.t('api.apiKeyInvalid', { defaultValue: 'API Key 无效' }),
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			if (axios.isAxiosError(error)) {
				const statusCode = error.response?.status;

				if (statusCode === 401 || statusCode === 403) {
					return {
						success: false,
						error: i18n.t('api.apiKeyInvalidRetry', { defaultValue: 'API Key 无效，请检查后重试' }),
						timestamp: new Date().toISOString(),
					};
				}

				return {
					success: false,
					error: error.response?.data?.error || i18n.t('api.connectFailed', { defaultValue: '连接失败' }),
					timestamp: new Date().toISOString(),
				};
			}
			return {
				success: false,
				error: i18n.t('api.unknownError', { defaultValue: '未知错误' }),
				timestamp: new Date().toISOString(),
			};
		} finally {
			setLoading(false);
		}
	}, []);

	const createData = useCallback(async (path: string, data: CreateDataRequest, signal?: AbortSignal): Promise<ApiResponse<StorageData>> => {
		try {
			const response = await axiosInstance.post(`/data${path}`, data, { signal });
			return response.data;
		} catch (error) {
			if (isCanceledError(error)) {
				throw error;
			}

			if (axios.isAxiosError(error)) {
				return {
					success: false,
					error: error.response?.data?.error || i18n.t('api.createFailed', { defaultValue: '创建失败' }),
					timestamp: new Date().toISOString(),
				};
			}
			throw error;
		}
	}, []);

	const uploadFile = useCallback(
		async (path: string, file: File, contentType: string, signal?: AbortSignal): Promise<ApiResponse<StorageData>> => {
			try {
				const formData = new FormData();
				formData.append('file', file);
				formData.append('type', 'binary');

				const response = await axiosInstance.post(`/data${path}`, formData, { signal });
				return response.data;
			} catch (error) {
				if (isCanceledError(error)) {
					throw error;
				}

				if (axios.isAxiosError(error)) {
					const statusCode = error.response?.status;
					let errorMessage = i18n.t('api.uploadFailed', { defaultValue: '上传失败' });

					if (statusCode === 400) {
						errorMessage = error.response?.data?.error || i18n.t('api.badRequest', { defaultValue: '请求参数错误，请检查文件格式' });
					} else if (statusCode === 401 || statusCode === 403) {
						errorMessage = i18n.t('api.apiKeyInvalidRelogin', { defaultValue: 'API Key 无效，请重新登录' });
					} else if (statusCode === 413) {
						errorMessage = i18n.t('api.fileTooLarge', { defaultValue: '文件过大，无法上传' });
					} else if (statusCode === 500) {
						errorMessage = error.response?.data?.error || i18n.t('api.serverInternalError', { defaultValue: '服务器内部错误' });
					}

					return {
						success: false,
						error: errorMessage,
						timestamp: new Date().toISOString(),
					};
				}
				throw error;
			}
		},
		[],
	);

	const replaceFile = useCallback(async (path: string, file: File): Promise<ApiResponse<StorageData>> => {
		try {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('type', 'binary');

			const response = await axiosInstance.put(`/data${path}`, formData);
			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					success: false,
					error: error.response?.data?.error || i18n.t('api.uploadFailed', { defaultValue: '上传失败' }),
					timestamp: new Date().toISOString(),
				};
			}
			throw error;
		}
	}, []);

	const updateData = useCallback(async (path: string, data: UpdateDataRequest): Promise<ApiResponse<StorageData>> => {
		try {
			const response = await axiosInstance.put(`/data${path}`, data);
			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					success: false,
					error: error.response?.data?.error || i18n.t('api.updateFailed', { defaultValue: '更新失败' }),
					timestamp: new Date().toISOString(),
				};
			}
			throw error;
		}
	}, []);

	const deleteData = useCallback(async (path: string): Promise<ApiResponse<void>> => {
		try {
			await axiosInstance.delete(`/data${path}`);
			return {
				success: true,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			if (axios.isAxiosError(error)) {
				if (error.response?.status === 204 || error.response?.status === 200) {
					return {
						success: true,
						timestamp: new Date().toISOString(),
					};
				}
				return {
					success: false,
					error: error.response?.data?.error || i18n.t('api.deleteFailed', { defaultValue: '删除失败' }),
					timestamp: new Date().toISOString(),
				};
			}
			throw error;
		}
	}, []);

	const listData = useCallback(
		async (
			page: number = 1,
			limit: number = 20,
			search?: string,
			sort?: string,
			order?: 'asc' | 'desc',
		): Promise<ApiResponse<PaginatedResponse<StorageData>>> => {
			try {
				const params = new URLSearchParams({
					page: page.toString(),
					limit: limit.toString(),
				});
				if (search) params.append('search', search);
				if (sort) params.append('sort', sort);
				if (order) params.append('order', order);

				const response = await axiosInstance.get(`/data?${params.toString()}`);
				return response.data;
			} catch (error) {
				if (axios.isAxiosError(error)) {
					return {
						success: false,
						error: error.response?.data?.error || i18n.t('api.listFailed', { defaultValue: '获取列表失败' }),
						timestamp: new Date().toISOString(),
					};
				}
				throw error;
			}
		},
		[],
	);

	const getConsoleStats = useCallback(async (): Promise<ApiResponse<any>> => {
		try {
			const response = await axiosInstance.get('/console/stats');
			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					success: false,
					error: error.response?.data?.error || i18n.t('api.consoleStatsFailed', { defaultValue: '获取控制台统计失败' }),
					timestamp: new Date().toISOString(),
				};
			}
			throw error;
		}
	}, []);

	const getConsoleInfo = useCallback(async (): Promise<ApiResponse<any>> => {
		try {
			const response = await axiosInstance.get('/console');
			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					success: false,
					error: error.response?.data?.error || i18n.t('api.consoleInfoFailed', { defaultValue: '获取控制台信息失败' }),
					timestamp: new Date().toISOString(),
				};
			}
			throw error;
		}
	}, []);

	const getConsoleHealth = useCallback(async (): Promise<ApiResponse<any>> => {
		try {
			const response = await axiosInstance.get('/console/health');
			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					success: false,
					error: error.response?.data?.error || i18n.t('api.consoleHealthFailed', { defaultValue: '获取控制台健康状态失败' }),
					timestamp: new Date().toISOString(),
				};
			}
			throw error;
		}
	}, []);

	const getConsoleConfig = useCallback(async (): Promise<ApiResponse<any>> => {
		try {
			const response = await axiosInstance.get('/console/config');
			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					success: false,
					error: error.response?.data?.error || i18n.t('api.consoleConfigFailed', { defaultValue: '获取控制台配置失败' }),
					timestamp: new Date().toISOString(),
				};
			}
			throw error;
		}
	}, []);

	const listPermissionRules = useCallback(async (enabled?: boolean, search?: string): Promise<ApiResponse<{ items: PermissionRule[] }>> => {
		try {
			const params = new URLSearchParams();
			if (typeof enabled === 'boolean') params.append('enabled', String(enabled));
			if (search) params.append('search', search);

			const response = await axiosInstance.get(`/permissions/rules${params.toString() ? `?${params.toString()}` : ''}`);
			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					success: false,
					error: error.response?.data?.error || i18n.t('permissions.messages.loadFailed', { defaultValue: '获取权限规则失败' }),
					timestamp: new Date().toISOString(),
				};
			}
			throw error;
		}
	}, []);

	const createPermissionRule = useCallback(async (data: PermissionRuleInput): Promise<ApiResponse<PermissionRule>> => {
		try {
			const response = await axiosInstance.post('/permissions/rules', data);
			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					success: false,
					error: error.response?.data?.error || i18n.t('permissions.messages.createFailed', { defaultValue: '创建权限规则失败' }),
					timestamp: new Date().toISOString(),
				};
			}
			throw error;
		}
	}, []);

	const updatePermissionRule = useCallback(async (id: string, data: PermissionRuleInput): Promise<ApiResponse<PermissionRule>> => {
		try {
			const response = await axiosInstance.put(`/permissions/rules/${id}`, data);
			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					success: false,
					error: error.response?.data?.error || i18n.t('permissions.messages.updateFailed', { defaultValue: '更新权限规则失败' }),
					timestamp: new Date().toISOString(),
				};
			}
			throw error;
		}
	}, []);

	const setPermissionRuleStatus = useCallback(async (id: string, enabled: boolean): Promise<ApiResponse<PermissionRule>> => {
		try {
			const response = await axiosInstance.patch(`/permissions/rules/${id}/status`, { enabled });
			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					success: false,
					error: error.response?.data?.error || i18n.t('permissions.messages.statusFailed', { defaultValue: '切换规则状态失败' }),
					timestamp: new Date().toISOString(),
				};
			}
			throw error;
		}
	}, []);

	const deletePermissionRule = useCallback(async (id: string): Promise<ApiResponse<void>> => {
		try {
			await axiosInstance.delete(`/permissions/rules/${id}`);
			return {
				success: true,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					success: false,
					error: error.response?.data?.error || i18n.t('permissions.messages.deleteFailed', { defaultValue: '删除权限规则失败' }),
					timestamp: new Date().toISOString(),
				};
			}
			throw error;
		}
	}, []);

	const evaluatePermissionRule = useCallback(async (data: PermissionEvaluationRequest): Promise<ApiResponse<PermissionDecision>> => {
		try {
			const response = await axiosInstance.post('/permissions/evaluate', data);
			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					success: false,
					error: error.response?.data?.error || i18n.t('permissions.messages.evaluateFailed', { defaultValue: '权限规则测试失败' }),
					timestamp: new Date().toISOString(),
				};
			}
			throw error;
		}
	}, []);

	return {
		apiKey,
		setApiKey,
		isConfigured,
		loading,
		testConnection,
		createData,
		uploadFile,
		replaceFile,
		updateData,
		deleteData,
		listData,
		getConsoleStats,
		getConsoleInfo,
		getConsoleHealth,
		getConsoleConfig,
		listPermissionRules,
		createPermissionRule,
		updatePermissionRule,
		setPermissionRuleStatus,
		deletePermissionRule,
		evaluatePermissionRule,
	};
};

export default useApi;
