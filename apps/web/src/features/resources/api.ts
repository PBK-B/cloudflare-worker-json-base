import { apiRequest, getResourceApiBasePath, getStoredApiKey } from '../../shared/api/client';
import type { CreateDataRequest, SharedApiResponse, SharedPaginatedResponse, StorageData, UpdateDataRequest } from '../../types';

function toStorageData(resource: any): StorageData {
	return {
		id: resource.path,
		path: resource.path,
		value: resource.value,
		type: resource.type,
		created_at: resource.createdAt,
		updated_at: resource.updatedAt,
		size: resource.size,
		content_type: resource.contentType,
		downloadable: resource.type === 'binary',
		downloadPath: resource.path,
		storage_location: 'kv',
	};
}

const resourceApi = {
	async createData(path: string, data: CreateDataRequest, signal?: AbortSignal): Promise<SharedApiResponse<StorageData>> {
		const response = await apiRequest<SharedApiResponse<any>>(`/admin/resources${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: data.value, type: data.type, contentType: data.content_type }),
			signal,
		});

		return { ...response, data: response.data ? toStorageData(response.data) : undefined };
	},
	async uploadFile(path: string, file: File, _contentType?: string, signal?: AbortSignal): Promise<SharedApiResponse<StorageData>> {
		const formData = new FormData();
		formData.append('file', file);
		const response = await apiRequest<SharedApiResponse<any>>(`/admin/resources${path}`, {
			method: 'POST',
			body: formData,
			signal,
		});

		return { ...response, data: response.data ? toStorageData(response.data) : undefined };
	},
	async replaceFile(path: string, file: File): Promise<SharedApiResponse<StorageData>> {
		const formData = new FormData();
		formData.append('file', file);
		const response = await apiRequest<SharedApiResponse<any>>(`/admin/resources${path}`, {
			method: 'PUT',
			body: formData,
		});

		return { ...response, data: response.data ? toStorageData(response.data) : undefined };
	},
	async updateData(path: string, data: UpdateDataRequest): Promise<SharedApiResponse<StorageData>> {
		const response = await apiRequest<SharedApiResponse<any>>(`/admin/resources${path}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: data.value, type: data.type, contentType: data.content_type }),
		});

		return { ...response, data: response.data ? toStorageData(response.data) : undefined };
	},
	async deleteData(path: string): Promise<SharedApiResponse<void>> {
		await apiRequest(`/admin/resources${path}`, { method: 'DELETE' });
		return { success: true, timestamp: new Date().toISOString() };
	},
	async listData(page = 1, limit = 20, search?: string, sort?: string, order?: 'asc' | 'desc'): Promise<SharedApiResponse<SharedPaginatedResponse<StorageData>>> {
		const params = new URLSearchParams({ page: String(page), limit: String(limit) });
		if (search) params.append('search', search);
		if (sort) params.append('sort', sort === 'updated_at' ? 'updatedAt' : sort);
		if (order) params.append('order', order);
		const response = await apiRequest<SharedApiResponse<SharedPaginatedResponse<any>>>(`/admin/resources?${params.toString()}`);

		return {
			...response,
			data: response.data
				? {
					...response.data,
					items: response.data.items.map(toStorageData),
				}
				: undefined,
		};
	},
	getResourceUrl(path: string): string {
		const url = new URL(`${getResourceApiBasePath()}${path}`, window.location.origin);
		const apiKey = getStoredApiKey();

		if (apiKey) {
			url.searchParams.set('key', apiKey);
		}

		return url.toString();
	},
};

export function useResourceApi() {
	return resourceApi;
}
