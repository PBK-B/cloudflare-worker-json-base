import { useState, useEffect, useCallback } from 'react'
import { ApiResponse, StorageData, CreateDataRequest, UpdateDataRequest, PaginatedResponse } from '../types'

const API_BASE_URL = '/api'

export const useApi = () => {
  const [apiKey, setApiKey] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const savedApiKey = localStorage.getItem('jsonbase-api-key')
    if (savedApiKey) {
      setApiKey(savedApiKey)
    }
  }, [])

  const saveApiKey = useCallback((key: string) => {
    setApiKey(key)
    localStorage.setItem('jsonbase-api-key', key)
  }, [])

  const makeRequest = useCallback(async <T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> => {
    setLoading(true)
    setError(null)

    try {
      const url = `${API_BASE_URL}${endpoint}`
      const authOptions = {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          ...options.headers,
        },
      }

      const response = await fetch(url, authOptions)
      const data: ApiResponse<T> = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [apiKey])

  const testConnection = useCallback(async (): Promise<ApiResponse<any>> => {
    return makeRequest('/data/test')
  }, [makeRequest])

  const fetchData = useCallback(async (path: string): Promise<ApiResponse<StorageData>> => {
    return makeRequest(`/data${path}`)
  }, [makeRequest])

  const createData = useCallback(async (path: string, data: CreateDataRequest): Promise<ApiResponse<StorageData>> => {
    return makeRequest(`/data${path}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }, [makeRequest])

  const updateData = useCallback(async (path: string, data: UpdateDataRequest): Promise<ApiResponse<StorageData>> => {
    return makeRequest(`/data${path}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }, [makeRequest])

  const deleteData = useCallback(async (path: string): Promise<ApiResponse<void>> => {
    return makeRequest(`/data${path}`, {
      method: 'DELETE',
    })
  }, [makeRequest])

  const listData = useCallback(async (page: number = 1, limit: number = 20): Promise<ApiResponse<PaginatedResponse<StorageData>>> => {
    return makeRequest(`/data?page=${page}&limit=${limit}`)
  }, [makeRequest])

  const checkHealth = useCallback(async (): Promise<ApiResponse<any>> => {
    return makeRequest('/health')
  }, [makeRequest])

  const isConfigured = Boolean(apiKey.trim())

  return {
    apiKey,
    setApiKey: saveApiKey,
    loading,
    error,
    isConfigured,
    testConnection,
    fetchData,
    createData,
    updateData,
    deleteData,
    listData,
    checkHealth,
  }
}