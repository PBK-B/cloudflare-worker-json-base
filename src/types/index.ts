// Shared type definitions
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  timestamp: string
}

export interface StorageData {
  id: string
  value: any
  type: 'json' | 'binary' | 'text'
  createdAt: string
  updatedAt: string
  size: number
  contentType?: string
}

export interface CreateDataRequest {
  value: any
  type?: 'json' | 'binary' | 'text'
  contentType?: string
}

export interface UpdateDataRequest {
  value: any
  type?: 'json' | 'binary' | 'text'
  contentType?: string
}

export interface Config {
  apiKey: string
  workerName: string
  kvNamespace: string
  domain?: string
  environment: 'development' | 'production'
  version: string
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  version: string
  timestamp: string
  uptime: number
  environment: string
}

export interface AuthContext {
  apiKey: string
  method: 'bearer' | 'query'
  valid: boolean
}

export interface WorkerEnv {
  JSONBIN: KVNamespace
  JSONBIN_PREVIEW: KVNamespace
  API_KEY?: string
  ENVIRONMENT?: string
  VERSION?: string
}

export interface ErrorDetail {
  code: string
  message: string
  details?: any
  timestamp: string
}

export interface PaginationParams {
  page?: number
  limit?: number
  sort?: string
  order?: 'asc' | 'desc'
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}