import { DataController, HealthController } from './controllers'
import { CorsHandler } from '../utils/response'
import { Logger } from '../utils/middleware'
import { WorkerEnv } from '../types'

export class Router {
  private dataController: DataController
  private healthController: HealthController

  constructor(env: WorkerEnv) {
    this.dataController = new DataController(env)
    this.healthController = new HealthController(env)
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const { pathname, method } = { pathname: url.pathname, method: request.method }

    try {
      Logger.info(`Incoming request`, { method, pathname, userAgent: request.headers.get('User-Agent') })

      const corsResponse = CorsHandler.handle(request)
      if (corsResponse) {
        return corsResponse
      }

      let response: Response

      if (pathname.startsWith('/api/')) {
        if (pathname === '/api/health' || pathname === '/api/test') {
          response = await this.healthController.health()
        } else if (pathname.startsWith('/api/data')) {
          response = await this.handleDataRoutes(request, pathname, method)
        } else if (pathname === '/api/') {
          response = await this.handleApiRoot()
        } else {
          response = new Response('API Endpoint Not Found', { status: 404 })
        }
      } else if (pathname === '/') {
        response = await this.handleRoot()
      } else if (pathname.startsWith('/assets/') || pathname === '/vite.svg') {
        // During development, let Vite handle static assets
        response = new Response('Static asset - handled by Vite', { status: 404 })
      } else {
        response = new Response('Not Found', { status: 404 })
      }

      return CorsHandler.addHeaders(response, request)
    } catch (error) {
      Logger.error('Router error', { pathname, method, error })
      return new Response('Internal Server Error', { status: 500 })
    }
  }

  private async handleDataRoutes(request: Request, pathname: string, method: string): Promise<Response> {
    switch (method) {
      case 'GET':
        if (pathname === '/api/data') {
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

  private async handleApiRoot(): Promise<Response> {
    return new Response(JSON.stringify({
      name: 'JSON Base API',
      version: '2.0.0',
      description: 'Cloudflare Workers JSON Storage Service',
      endpoints: {
        health: '/api/health',
        data: '/api/data',
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
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 30px;
      text-align: center;
    }
    .endpoint {
      background: #f8f9fa;
      border-left: 4px solid #007bff;
      padding: 15px;
      margin: 10px 0;
      border-radius: 5px;
    }
    .method {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 3px;
      font-weight: bold;
      font-size: 12px;
    }
    .get { background: #28a745; color: white; }
    .post { background: #007bff; color: white; }
    .put { background: #ffc107; color: black; }
    .delete { background: #dc3545; color: white; }
    code {
      background: #f1f3f4;
      padding: 2px 5px;
      border-radius: 3px;
      font-family: 'Monaco', 'Menlo', monospace;
    }
    pre {
      background: #f1f3f4;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚀 JSON Base API</h1>
    <p>Cloudflare Workers JSON Storage Service</p>
    <p>Version 2.0.0</p>
  </div>

  <h2>📋 API Endpoints</h2>
  
  <div class="endpoint">
    <span class="method get">GET</span> <code>/api/health</code>
    <p>Check API health status</p>
  </div>

  <div class="endpoint">
    <span class="method get">GET</span> <code>/api/data</code>
    <p>List all stored data (with pagination)</p>
  </div>

  <div class="endpoint">
    <span class="method get">GET</span> <code>/api/data/{path}</code>
    <p>Retrieve data from specific path</p>
  </div>

  <div class="endpoint">
    <span class="method post">POST</span> <code>/api/data/{path}</code>
    <p>Create new data at specified path</p>
  </div>

  <div class="endpoint">
    <span class="method put">PUT</span> <code>/api/data/{path}</code>
    <p>Update existing data at specified path</p>
  </div>

  <div class="endpoint">
    <span class="method delete">DELETE</span> <code>/api/data/{path}</code>
    <p>Delete data at specified path</p>
  </div>

  <h2>🔐 Authentication</h2>
  <p>Include your API key in one of these ways:</p>
  <ul>
    <li>Header: <code>Authorization: Bearer YOUR_API_KEY</code></li>
    <li>Query: <code>?key=YOUR_API_KEY</code></li>
  </ul>

  <h2>💡 Usage Examples</h2>
  <div class="endpoint">
    <h4>Store JSON data:</h4>
    <pre><code>curl -X POST "https://your-worker.workers.dev/api/data/demo/user" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "John", "age": 30}'</code></pre>
  </div>

  <div class="endpoint">
    <h4>Retrieve data:</h4>
    <pre><code>curl -X GET "https://your-worker.workers.dev/api/data/demo/user" \\
  -H "Authorization: Bearer YOUR_API_KEY"</code></pre>
  </div>

  <footer style="margin-top: 50px; text-align: center; color: #666;">
    <p>Powered by Cloudflare Workers • Version 2.0.0</p>
  </footer>
</body>
</html>`
    
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    })
  }
}