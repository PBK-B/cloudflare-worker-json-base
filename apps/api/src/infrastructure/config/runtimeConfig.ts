import { RESOURCE_API_BASE_PATH, SYSTEM_API_BASE_PATH, WEB_BASE_PATH, normalizeBasePath } from '@jsonbase/shared';

export interface RuntimeConfig {
	environment: string;
	version: string;
	storageBackend: 'd1' | 'kv';
	webBasePath: string;
	apiBasePath: string;
	resourceBasePath: string;
	apiKey?: string;
	rateLimitEnabled: boolean;
}

export interface WorkerEnv {
	JSONBASE_DB?: D1Database;
	JSONBIN?: KVNamespace;
	WEBUI: Fetcher;
	API_KEY?: string;
	ENVIRONMENT?: string;
	VERSION?: string;
	STORAGE_BACKEND?: string;
	WEB_BASE_PATH?: string;
	API_BASE_PATH?: string;
	RESOURCE_BASE_PATH?: string;
	RATE_LIMIT_ENABLED?: string | boolean;
}

export function createRuntimeConfig(env: WorkerEnv): RuntimeConfig {
	return {
		environment: env.ENVIRONMENT || 'development',
		version: env.VERSION || '3.0.0',
		storageBackend: env.STORAGE_BACKEND === 'kv' ? 'kv' : 'd1',
		webBasePath: normalizeBasePath(env.WEB_BASE_PATH || WEB_BASE_PATH) || '/',
		apiBasePath: normalizeBasePath(env.API_BASE_PATH || SYSTEM_API_BASE_PATH) || '/',
		resourceBasePath: normalizeBasePath(env.RESOURCE_BASE_PATH || RESOURCE_API_BASE_PATH),
		apiKey: env.API_KEY,
		rateLimitEnabled: env.RATE_LIMIT_ENABLED === true || env.RATE_LIMIT_ENABLED === 'true'
	};
}
