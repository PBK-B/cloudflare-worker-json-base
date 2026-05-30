export interface HealthDto {
	status: 'healthy' | 'unhealthy';
	version: string;
	timestamp: string;
	environment: string;
}

export interface ConsoleStatsDto {
	totalCount: number;
	totalSize: number;
	pageCount: number;
	storageBackend: string;
	environment: string;
	version: string;
}

export interface ConsoleConfigDto {
	environment: string;
	version: string;
	storageBackend: string;
	webBasePath: string;
	apiBasePath: string;
}

export interface ConsoleInfoDto {
	name: string;
	version: string;
	endpoints: Record<string, string>;
	features: string[];
	timestamp: string;
}
