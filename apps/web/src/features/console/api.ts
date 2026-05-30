import { apiRequest } from '../../shared/api/client';
import type { ConsoleInfo, ConsoleStats, SharedApiResponse } from '../../types';

const consoleApi = {
	getConsoleStats(): Promise<SharedApiResponse<ConsoleStats>> {
		return apiRequest('/admin/console/stats');
	},
	getConsoleInfo(): Promise<SharedApiResponse<ConsoleInfo>> {
		return apiRequest('/admin/console');
	},
	getConsoleHealth(): Promise<SharedApiResponse<any>> {
		return apiRequest('/health');
	},
	getConsoleConfig(): Promise<SharedApiResponse<any>> {
		return apiRequest('/admin/console/config');
	},
};

export function useConsoleApi() {
	return consoleApi;
}
