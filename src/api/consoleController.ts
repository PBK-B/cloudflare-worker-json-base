import { ResponseBuilder, ApiError } from '../utils/response'
import { AuthMiddleware, ValidationMiddleware, RateLimiter, Logger } from '../utils/middleware'
import { StorageAdapter } from '../storage/storageAdapter'
import { WorkerEnv } from '../types'
import { Config } from '../utils/config'

export interface ConsoleStats {
	totalCount: number
	totalSize: number
	pageCount: number
	storageBackend: string
	environment: string
	version: string
}

export interface ConsoleInfo {
	name: string
	version: string
	endpoints: Record<string, string>
	features: string[]
	timestamp: string
}

export class ConsoleController {
	private storageAdapter: StorageAdapter

	constructor(env: WorkerEnv) {
		;(globalThis as any).ENV = env
		Config.getInstance(env)
		this.storageAdapter = new StorageAdapter({ env })
		AuthMiddleware.initialize(env)
		RateLimiter.initialize(env)
	}

	async stats(request: Request): Promise<Response> {
		try {
			const auth = await AuthMiddleware.requireAuth(request)

			const stats = await this.storageAdapter.getStats()
			const config = Config.getInstance()

			const consoleStats: ConsoleStats = {
				totalCount: stats.total,
				totalSize: stats.totalSize,
				pageCount: Math.ceil(stats.total / 20),
				storageBackend: config.storageBackend,
				environment: config.environment,
				version: config.version
			}

			Logger.info('Console stats requested', { auth: auth.apiKey.substring(0, 8) })

			return ResponseBuilder.success(consoleStats, 'Console stats retrieved successfully')
		} catch (error) {
			Logger.error('Console stats request failed', error)
			return this.handleError(error)
		}
	}

	async info(request: Request): Promise<Response> {
		try {
			const config = Config.getInstance()

			const consoleInfo: ConsoleInfo = {
				name: 'JSON Base Console',
				version: config.version,
				endpoints: {
					stats: '/._jsondb_/api/console/stats',
					info: '/._jsondb_/api/console/info',
					health: '/._jsondb_/api/console/health',
					config: '/._jsondb_/api/console/config'
				},
				features: [
					'JSON Data Storage',
					'File Storage',
					'Path-based Data Management',
					'Hybrid Storage (D1 + KV)',
					'Rate Limiting',
					'API Key Authentication'
				],
				timestamp: new Date().toISOString()
			}

			return ResponseBuilder.success(consoleInfo, 'Console info retrieved successfully')
		} catch (error) {
			Logger.error('Console info request failed', error)
			return this.handleError(error)
		}
	}

	async health(request: Request): Promise<Response> {
		try {
			const auth = await AuthMiddleware.requireAuth(request)
			const config = Config.getInstance()

			const storageStats = await this.storageAdapter.getStats()

			const healthData = {
				status: 'healthy' as const,
				version: config.version,
				timestamp: new Date().toISOString(),
				environment: config.environment,
				storageBackend: config.storageBackend,
				storage: {
					totalFiles: storageStats.total,
					totalSize: storageStats.totalSize
				},
				apiKey: {
					valid: true,
					method: auth.method
				}
			}

			Logger.info('Console health check', { auth: auth.apiKey.substring(0, 8) })

			return ResponseBuilder.success(healthData, 'Console is healthy')
		} catch (error) {
			Logger.error('Console health check failed', error)
			return this.handleError(error)
		}
	}

	async config(request: Request): Promise<Response> {
		try {
			const auth = await AuthMiddleware.requireAuth(request)
			const config = Config.getInstance()

			const configData = {
				environment: config.environment,
				version: config.version,
				storageBackend: config.storageBackend,
				kvNamespace: config.kvNamespace,
				isProduction: config.isProduction,
				isDevelopment: config.isDevelopment
			}

			Logger.info('Console config requested', { auth: auth.apiKey.substring(0, 8) })

			return ResponseBuilder.success(configData, 'Console config retrieved successfully')
		} catch (error) {
			Logger.error('Console config request failed', error)
			return this.handleError(error)
		}
	}

	private handleError(error: any): Response {
		if (error instanceof ApiError) {
			return error.toResponse()
		}

		Logger.error('Unexpected console error', error)
		return ApiError.internal('Internal server error').toResponse()
	}
}
