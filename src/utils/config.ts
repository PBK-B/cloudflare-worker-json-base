// Environment configuration management
export interface EnvConfig {
	apiKey: string;
	environment: 'development' | 'production';
	version: string;
	kvNamespace: string;
	storageBackend: 'kv' | 'd1';
	rateLimitEnabled: boolean;
}

export class Config {
	private static instance: Config;
	private config: EnvConfig;

  constructor(env: any) {
    const storageBackend = (env?.STORAGE_BACKEND || env?.STORAGE_LOCATION || 'kv').toLowerCase();
    const rateLimitEnabled = env?.RATE_LIMIT_ENABLED === 'true' || env?.RATE_LIMIT_ENABLED === true;
    this.config = {
      apiKey: env?.API_KEY || 'MYDATABASEKEY',
      environment: (env?.ENVIRONMENT as 'development' | 'production') || 'development',
      version: env?.VERSION || '2.0.0',
      kvNamespace: env?.KV_NAMESPACE || 'JSONBIN',
      storageBackend: storageBackend === 'd1' ? 'd1' : 'kv',
      rateLimitEnabled,
    };
  }

	static getInstance(env?: any): Config {
		if (env) {
			Config.instance = new Config(env);
		} else if (!Config.instance) {
			throw new Error('Config requires environment on first instantiation');
		}
		return Config.instance;
	}

	get apiKey(): string {
		return this.config.apiKey;
	}

	get environment(): string {
		return this.config.environment;
	}

	get version(): string {
		return this.config.version;
	}

	get kvNamespace(): string {
		return this.config.kvNamespace;
	}

	get storageBackend(): 'kv' | 'd1' {
		return this.config.storageBackend;
	}

	get rateLimitEnabled(): boolean {
		return this.config.rateLimitEnabled;
	}

	get isProduction(): boolean {
		return this.config.environment === 'production';
	}

	get isDevelopment(): boolean {
		return this.config.environment === 'development';
	}

	updateConfig(updates: Partial<EnvConfig>): void {
		this.config = { ...this.config, ...updates };
	}

	toJSON(): EnvConfig {
		return { ...this.config };
	}
}

// Constants
export const HTTP_STATUS = {
	OK: 200,
	CREATED: 201,
	NO_CONTENT: 204,
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	METHOD_NOT_ALLOWED: 405,
	TOO_MANY_REQUESTS: 429,
	INTERNAL_SERVER_ERROR: 500,
	SERVICE_UNAVAILABLE: 503,
} as const;

export const ERROR_CODES = {
	UNAUTHORIZED: 'UNAUTHORIZED',
	KV_NOT_FOUND: 'KV_NOT_FOUND',
	INVALID_API_KEY: 'INVALID_API_KEY',
	VALIDATION_ERROR: 'VALIDATION_ERROR',
	RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
	INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export const CONTENT_TYPES = {
	JSON: 'application/json',
	TEXT: 'text/plain',
	HTML: 'text/html',
	BINARY: 'application/octet-stream',
	FORM_DATA: 'multipart/form-data',
} as const;

export const API_ENDPOINTS = {
	HEALTH: '/._jsondb_/api/health',
	DATA: '/._jsondb_/api/data',
	CONSOLE: '/._jsondb_/api/console',
	CONSOLE_STATS: '/._jsondb_/api/console/stats',
	CONSOLE_INFO: '/._jsondb_/api/console',
	CONSOLE_HEALTH: '/._jsondb_/api/console/health',
	CONSOLE_CONFIG: '/._jsondb_/api/console/config',
	CONFIG: '/._jsondb_/api/config',
	AUTH: '/._jsondb_/api/auth',
} as const;
