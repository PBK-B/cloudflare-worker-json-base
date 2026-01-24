import { StorageData, CreateDataRequest, UpdateDataRequest, WorkerEnv, PaginatedResponse, PaginationParams } from '../types'
import { Config } from '../utils/config'
import { ApiError } from '../utils/response'
import { Logger } from '../utils/middleware'

const getKvNamespace = (env: WorkerEnv) => {
  return env.JSONBIN || env.JSONBIN_PREVIEW
}

export class StorageService {
  private env: WorkerEnv
  private config: Config

  constructor(env: WorkerEnv) {
    this.env = env
    this.config = Config.getInstance(env)
  }

  async getData(pathname: string): Promise<StorageData> {
    const kvNamespace = getKvNamespace(this.env)
    if (!kvNamespace) {
      throw ApiError.internal('KV namespace not available')
    }

    const value = await kvNamespace.get(pathname)
    if (value === null) {
      throw ApiError.notFound(`Data not found at path: ${pathname}`)
    }

    try {
      const data = JSON.parse(value)
      Logger.debug('Retrieved data', { pathname, size: value.length })
      return data
    } catch (error) {
      Logger.error('Failed to parse stored data', { pathname, error })
      throw ApiError.internal('Corrupted data')
    }
  }

  async createData(pathname: string, request: CreateDataRequest): Promise<StorageData> {
    const kvNamespace = getKvNamespace(this.env)
    if (!kvNamespace) {
      throw ApiError.internal('KV namespace not available')
    }

    const existing = await kvNamespace.get(pathname)
    if (existing !== null) {
      throw ApiError.badRequest(`Data already exists at path: ${pathname}`)
    }

    return this.saveData(pathname, request.value, request.type || 'json', request.contentType)
  }

  async updateData(pathname: string, request: UpdateDataRequest): Promise<StorageData> {
    if (!this.env.JSONBIN) {
      throw ApiError.internal('KV namespace not available')
    }

    const existing = await this.env.JSONBIN.get(pathname)
    if (existing === null) {
      throw ApiError.notFound(`Data not found at path: ${pathname}`)
    }

    return this.saveData(pathname, request.value, request.type || 'json', request.contentType)
  }

  async upsertData(pathname: string, request: CreateDataRequest | UpdateDataRequest): Promise<StorageData> {
    if (!this.env.JSONBIN) {
      throw ApiError.internal('KV namespace not available')
    }

    return this.saveData(pathname, request.value, request.type || 'json', request.contentType)
  }

  async deleteData(pathname: string): Promise<void> {
    if (!this.env.JSONBIN) {
      throw ApiError.internal('KV namespace not available')
    }

    const kvNamespace = getKvNamespace(this.env)
    await kvNamespace.delete(pathname)
    Logger.info('Data deleted', { pathname })
  }

  async listData(params: PaginationParams = {}): Promise<PaginatedResponse<StorageData>> {
    const kvNamespace = getKvNamespace(this.env)
    if (!kvNamespace) {
      throw ApiError.internal('KV namespace not available')
    }

    const { prefix, search, page = 1, limit = 20, sort = 'updatedAt', order = 'desc' } = params

    const list = await kvNamespace.list({
      prefix: prefix || '',
      limit: Math.min(limit * 2, 1000)
    })

    let allData: StorageData[] = []

    for (const key of list.keys) {
      try {
        const value = await kvNamespace.get(key.name)
        if (value) {
          const parsed = JSON.parse(value)
          if (parsed && typeof parsed === 'object' && parsed.id) {
            allData.push({
              id: parsed.id || key.name,
              value: parsed.value ?? '',
              type: parsed.type || 'json',
              createdAt: parsed.createdAt || new Date().toISOString(),
              updatedAt: parsed.updatedAt || new Date().toISOString(),
              size: parsed.size || 0,
              contentType: parsed.contentType
            })
          }
        }
      } catch (error) {
        Logger.warn('Failed to parse list item', { key: key.name, error })
      }
    }

    if (search) {
      const searchLower = search.toLowerCase()
      allData = allData.filter(item =>
        item.id.toLowerCase().includes(searchLower) ||
        (typeof item.value === 'string' && item.value.toLowerCase().includes(searchLower))
      )
    }

    allData.sort((a, b) => {
      const aVal = a[sort as keyof StorageData]
      const bVal = b[sort as keyof StorageData]

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return order === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return order === 'asc' ? aVal - bVal : bVal - aVal
      }

      return 0
    })

    const total = allData.length
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const items = allData.slice(startIndex, endIndex)
    const hasMore = endIndex < total

    return { items, total, page, limit, hasMore }
  }

  private async saveData(
    pathname: string,
    value: any,
    type: 'json' | 'binary' | 'text',
    contentType?: string
  ): Promise<StorageData> {
    const now = new Date().toISOString()
    
    let processedValue = value
    let detectedContentType = contentType

    if (type === 'json') {
      processedValue = JSON.stringify(value)
      detectedContentType = detectedContentType || 'application/json'
    } else if (type === 'binary') {
      if (typeof value === 'string' && value.startsWith('data:')) {
        detectedContentType = detectedContentType || value.split(';')[0].split(':')[1]
      } else {
        detectedContentType = detectedContentType || 'application/octet-stream'
      }
    } else {
      processedValue = String(value)
      detectedContentType = detectedContentType || 'text/plain'
    }

    const storageData: StorageData = {
      id: pathname,
      value: processedValue,
      type,
      createdAt: now,
      updatedAt: now,
      size: new Blob([processedValue]).size,
      contentType: detectedContentType
    }

    const kvNamespace = getKvNamespace(this.env)
    await kvNamespace.put(pathname, JSON.stringify(storageData))
    Logger.info('Data saved', { pathname, type, size: storageData.size })

    return storageData
  }

  async getHealth(): Promise<{ status: string; kv: boolean; timestamp: string }> {
    const kvAvailable = !!(this.env.JSONBIN)
    
    if (kvAvailable) {
      try {
        const kvNamespace = getKvNamespace(this.env)
      if (kvNamespace) {
        try {
          await kvNamespace.get('__health_check__')
        } catch (error) {
          Logger.warn('KV health check failed', { error })
        }
      }
      } catch (error) {
        Logger.warn('KV health check failed', { error })
      }
    }

    return {
      status: kvAvailable ? 'healthy' : 'unhealthy',
      kv: kvAvailable,
      timestamp: new Date().toISOString()
    }
  }
}