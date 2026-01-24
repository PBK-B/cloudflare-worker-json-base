import { DataController, HealthController } from './controllers'
import { StorageController } from './storageController'
import { ConsoleController } from './consoleController'
import { CorsHandler } from '../utils/response'
import { Logger } from '../utils/middleware'
import { WorkerEnv } from '../types'

export class Router {
  private dataController!: DataController
  private healthController!: HealthController
  private storageController!: StorageController
  private consoleController!: ConsoleController
  private initError: Error | null = null;

  constructor(env: WorkerEnv) {
    try {
      this.dataController = new DataController(env)
      this.healthController = new HealthController(env)
      this.storageController = new StorageController(env)
      this.consoleController = new ConsoleController(env)
    } catch (error) {
      this.initError = error instanceof Error ? error : new Error('Unknown initialization error');
    }
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const { pathname, method } = { pathname: url.pathname, method: request.method }

    if (this.initError) {
      return new Response(JSON.stringify({
        success: false,
        error: this.initError.message,
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      Logger.info(`Incoming request`, { method, pathname, userAgent: request.headers.get('User-Agent') })

      const corsResponse = CorsHandler.handle(request)
      if (corsResponse) {
        return corsResponse
      }

      let response: Response

      if (pathname.startsWith('/._jsondb_/api/')) {
        const path = pathname.replace('/._jsondb_/api', '')
        if (path === '/health' || path === '/test') {
          response = await this.healthController.health(request)
        } else if (path.startsWith('/storage')) {
          response = await this.handleStorageRoutes(request, pathname, method)
        } else if (path.startsWith('/data')) {
          response = await this.handleDataRoutes(request, pathname, method)
        } else if (path.startsWith('/console')) {
          response = await this.handleConsoleRoutes(request, pathname, method)
        } else if (path === '/' || path === '') {
          response = await this.handleApiRoot()
        } else {
          response = new Response('API Endpoint Not Found', { status: 404 })
        }
      } else if (pathname === '/') {
        response = await this.handleRoot()
      } else if (pathname.startsWith('/assets/') || pathname === '/vite.svg') {
        response = new Response('Static asset - handled by Vite', { status: 404 })
      } else {
        response = new Response('Not Found', { status: 404 })
      }

      return CorsHandler.addHeaders(response, request)
    } catch (error) {
      Logger.error('Router error', { pathname, method, error })
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  private async handleStorageRoutes(request: Request, pathname: string, method: string): Promise<Response> {
    const path = pathname.replace('/._jsondb_/api', '')
    switch (method) {
      case 'GET':
        if (path === '/storage') {
          return await this.storageController.list(request)
        } else if (path.endsWith('/verify')) {
          return await this.storageController.verify(request)
        } else if (path.endsWith('/meta') || path.endsWith('/metadata')) {
          return await this.storageController.getMetadata(request)
        }
        return await this.storageController.download(request)

      case 'POST':
        return await this.storageController.upload(request)

      case 'DELETE':
        return await this.storageController.delete(request)

      default:
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { 'Allow': 'GET, POST, DELETE' }
        })
    }
  }

  private async handleDataRoutes(request: Request, pathname: string, method: string): Promise<Response> {
    const path = pathname.replace('/._jsondb_/api', '')
    switch (method) {
      case 'GET':
        if (path === '/data') {
          return await this.dataController.list(request)
        }
        return await this.dataController.get(request)

      case 'POST':
        return await this.dataController.post(request)

      case 'PUT':
        return await this.dataController.put(request)

      case 'DELETE':
        return await this.dataController.delete(request)

      default:
        return new Response('Method Not Allowed', { 
          status: 405,
          headers: { 'Allow': 'GET, POST, PUT, DELETE' }
        })
    }
  }

  private async handleConsoleRoutes(request: Request, pathname: string, method: string): Promise<Response> {
    switch (method) {
      case 'GET':
        if (pathname === '/._jsondb_/api/console' || pathname === '/._jsondb_/api/console/') {
          return await this.consoleController.info(request)
        } else if (pathname.endsWith('/stats')) {
          return await this.consoleController.stats(request)
        } else if (pathname.endsWith('/health')) {
          return await this.consoleController.health(request)
        } else if (pathname.endsWith('/config')) {
          return await this.consoleController.config(request)
        }
        return new Response('Console Endpoint Not Found', { status: 404 })

      default:
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { 'Allow': 'GET' }
        })
    }
  }

  private async handleApiRoot(): Promise<Response> {
    return new Response(JSON.stringify({
      name: 'JSON Base API',
      version: '2.0.0',
      description: 'Cloudflare Workers JSON Storage Service',
      endpoints: {
        health: '/api/health',
        data: '/api/data',
        storage: '/api/storage',
        test: '/api/data/test'
      },
      documentation: '/api/docs',
      timestamp: new Date().toISOString()
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  private async handleRoot(): Promise<Response> {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JSON Base API</title>
</head>
<body>
  <h1>JSON Base API</h1>
  <p>Version 2.0.0</p>
  <p>Cloudflare Workers JSON Storage Service</p>
</body>
</html>`
    
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    })
  }
}
