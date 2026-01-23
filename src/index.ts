import { WorkerEnv } from './types'
import { Router } from './api/router'
import { Logger } from './utils/middleware'

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now()
    
    try {
      Logger.info('Worker initialized', {
        environment: env.ENVIRONMENT || 'development',
        version: env.VERSION || '2.0.0'
      })

      const router = new Router(env)
      const response = await router.handle(request)

      const duration = Date.now() - startTime
      Logger.info('Request completed', {
        method: request.method,
        url: request.url,
        status: response.status,
        duration: `${duration}ms`
      })

      return response
    } catch (error) {
      const duration = Date.now() - startTime
      Logger.error('Worker error', {
        method: request.method,
        url: request.url,
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`
      })

      return new Response(JSON.stringify({
        success: false,
        error: 'Internal Server Error',
        timestamp: new Date().toISOString()
      }, null, 2), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      })
    }
  }
}