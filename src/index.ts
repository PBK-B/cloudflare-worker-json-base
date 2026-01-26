import { WorkerEnv } from './types'
import { Router } from './api/router'
import { Logger } from './utils/middleware'

const DASH_PATH = '/dash'

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now()
    const url = new URL(request.url)
    const pathname = url.pathname

    try {
      Logger.info('Worker initialized', {
        environment: env.ENVIRONMENT || 'development',
        version: env.VERSION || '2.0.0'
      })

      if (pathname === DASH_PATH) {
        return new Response(null, {
          status: 302,
          headers: { 'Location': DASH_PATH + '/' }
        })
      }

      if (pathname.startsWith(DASH_PATH) || pathname === DASH_PATH) {
        const assetPath = pathname.replace(DASH_PATH, '')
        const assetUrl = new URL(assetPath, request.url)
        return await env.WEBUI.fetch(assetUrl.toString(), request)
      }

      const router = new Router(env)
      const response = await router.handle(request)

      const duration = Date.now() - startTime
      Logger.info('Request completed', {
        method: request.method,
        url: request.url,
        status: response?.status ?? 0,
        duration: `${duration}ms`
      })

      return response || new Response(JSON.stringify({
        success: false,
        error: 'No response generated'
      }), { status: 500, headers: { 'Content-Type': 'application/json' } })
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
