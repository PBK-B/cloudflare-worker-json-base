// Hybrid storage types for D1 + KV support
export type StorageLocation = 'd1' | 'kv';

export interface StorageMetadata {
  id: string;
  type: 'json' | 'binary' | 'text';
  content_type?: string;
  size: number;
  created_at: string;
  updated_at: string;
  storage_location: StorageLocation;
  original_name?: string;
  chunk_count?: number;
  compression?: 'gzip' | 'none';
}

export interface HybridStorageData {
  metadata: StorageMetadata;
  value: any;
}

export interface CreateHybridDataRequest {
  value: any;
  type?: 'json' | 'binary' | 'text';
  content_type?: string;
  original_name?: string;
}

export interface UpdateHybridDataRequest {
  value: any;
  type?: 'json' | 'binary' | 'text';
  content_type?: string;
}

export interface StorageStats {
  total_items: number;
  d1_items: number;
  kv_items: number;
  total_size: number;
  d1_size: number;
  kv_size: number;
}

export const STORAGE_LIMITS = {
  D1_MAX_SIZE: 1024 * 1024, // 1MB for D1
  KV_MAX_SIZE: 25 * 1024 * 1024, // 25MB for KV
  CHUNK_SIZE: 1024 * 1024, // 1MB chunks for KV
};

export const isLargeFile = (size: number): boolean => {
  return size >= STORAGE_LIMITS.D1_MAX_SIZE;
};