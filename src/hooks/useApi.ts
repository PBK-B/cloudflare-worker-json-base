import { useState, useEffect, useCallback } from 'react';
import axios, { AxiosError } from 'axios';
import useAxios, { configure } from 'axios-hooks';
import { ApiResponse, StorageData, CreateDataRequest, UpdateDataRequest, PaginatedResponse } from '../types';

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
	return config;
});

axiosInstance.interceptors.response.use(
	(response) => response,
	(error: AxiosError) => {
		if (error.response?.status === 401 || error.response?.status === 403) {
			localStorage.removeItem('jsonbase-verified');
			localStorage.removeItem('jsonbase-api-key');
			window.location.href = '/login';
		}
		return Promise.reject(error);
	}
);

configure({ axios: axiosInstance });

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
					message: 'API Key 有效',
					timestamp: new Date().toISOString(),
					data: response.data.data
				};
			}
			return {
				success: false,
				error: 'API Key 无效',
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			if (axios.isAxiosError(error)) {
				const statusCode = error.response?.status;
				
				if (statusCode === 401 || statusCode === 403) {
					return {
						success: false,
						error: 'API Key 无效，请检查后重试',
						timestamp: new Date().toISOString(),
					};
				}
				
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
		} finally {
			setLoading(false);
		}
	}, []);

	const createData = useCallback(
		async (path: string, data: CreateDataRequest): Promise<ApiResponse<StorageData>> => {
			try {
				const response = await axiosInstance.post(`/data${path}`, data);
				return response.data;
			} catch (error) {
				if (axios.isAxiosError(error)) {
					return {
						success: false,
						error: error.response?.data?.error || '创建失败',
						timestamp: new Date().toISOString(),
					};
				}
				throw error;
			}
		},
		[]
	);

	const uploadFile = useCallback(
		async (path: string, file: File, type: string): Promise<ApiResponse<StorageData>> => {
			try {
				const formData = new FormData();
				formData.append('file', file);
				formData.append('type', type);
				
				const response = await axiosInstance.post(`/data${path}`, formData);
				return response.data;
			} catch (error) {
				if (axios.isAxiosError(error)) {
					const statusCode = error.response?.status;
					let errorMessage = '上传失败';
					
					if (statusCode === 400) {
						errorMessage = error.response?.data?.error || '请求参数错误，请检查文件格式';
					} else if (statusCode === 401 || statusCode === 403) {
						errorMessage = 'API Key 无效，请重新登录';
					} else if (statusCode === 413) {
						errorMessage = '文件过大，无法上传';
					} else if (statusCode === 500) {
						errorMessage = error.response?.data?.error || '服务器内部错误';
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
		[]
	);

	const updateData = useCallback(
		async (path: string, data: UpdateDataRequest): Promise<ApiResponse<StorageData>> => {
			try {
				const response = await axiosInstance.put(`/data${path}`, data);
				return response.data;
			} catch (error) {
				if (axios.isAxiosError(error)) {
					return {
						success: false,
						error: error.response?.data?.error || '更新失败',
						timestamp: new Date().toISOString(),
					};
				}
				throw error;
			}
		},
		[]
	);

	const deleteData = useCallback(async (path: string): Promise<ApiResponse<void>> => {
		try {
			await axiosInstance.delete(`/data${path}`);
			return {
				success: true,
				timestamp: new Date().toISOString()
			};
		} catch (error) {
			if (axios.isAxiosError(error)) {
				if (error.response?.status === 204 || error.response?.status === 200) {
					return {
						success: true,
						timestamp: new Date().toISOString()
					};
				}
				return {
					success: false,
					error: error.response?.data?.error || '删除失败',
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
			order?: 'asc' | 'desc'
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
						error: error.response?.data?.error || '获取列表失败',
						timestamp: new Date().toISOString(),
					};
				}
				throw error;
			}
		},
		[]
	);

	const getConsoleStats = useCallback(async (): Promise<ApiResponse<any>> => {
		try {
			const response = await axiosInstance.get('/console/stats');
			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				return {
					success: false,
					error: error.response?.data?.error || '获取控制台统计失败',
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
					error: error.response?.data?.error || '获取控制台信息失败',
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
					error: error.response?.data?.error || '获取控制台健康状态失败',
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
					error: error.response?.data?.error || '获取控制台配置失败',
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
		updateData,
		deleteData,
		listData,
		getConsoleStats,
		getConsoleInfo,
		getConsoleHealth,
		getConsoleConfig,
	};
};

export default useApi;
