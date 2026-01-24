// Abstract storage interfaces - storage location agnostic

export interface FileMetadata {
  id: string;
  name?: string;
  contentType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  checksum: string;
  chunkCount: number;
  chunkSize: number;
  storageBackend: string;
}

export interface StoredFile {
  metadata: FileMetadata;
  data: Uint8Array;
}

export interface StorageResult {
  success: boolean;
  fileId?: string;
  metadata?: FileMetadata;
  error?: string;
}

export interface StorageProvider {
  // Write data and return a storage handle
  write(data: Uint8Array, metadata: Omit<FileMetadata, 'id' | 'storageBackend'>): Promise<string>;

  // Read data by storage handle
  read(handle: string): Promise<Uint8Array>;

  // Delete data by storage handle
  delete(handle: string): Promise<void>;

  // Check if data exists
  exists(handle: string): Promise<boolean>;

  // Get the name of this storage backend
  getBackendName(): string;
}

export interface ChunkStorageProvider extends StorageProvider {
  // Write a single chunk
  writeChunk(handle: string, chunkIndex: number, data: Uint8Array): Promise<void>;

  // Read a single chunk
  readChunk(handle: string, chunkIndex: number): Promise<Uint8Array>;

  // Delete all chunks for a handle
  deleteChunks(handle: string, chunkCount: number): Promise<void>;

  // Get the number of chunks for a handle
  getChunkCount(handle: string): Promise<number>;
}

export interface MetadataStorage {
  save(metadata: FileMetadata): Promise<void>;
  load(id: string): Promise<FileMetadata | null>;
  delete(id: string): Promise<void>;
  list(prefix?: string, limit?: number, offset?: number): Promise<FileMetadata[]>;
  getStats(): Promise<{ totalFiles: number; totalSize: number }>;
}

export const DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1MB
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB limit per file

export function calculateChunkCount(size: number, chunkSize: number = DEFAULT_CHUNK_SIZE): number {
  return Math.ceil(size / chunkSize);
}

export function calculateChecksum(data: Uint8Array): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export async function calculateChecksumAsync(data: Uint8Array): Promise<string> {
  const bytes = new Uint8Array(data);
  let hash = 0;
  for (let i = 0; i < bytes.length; i++) {
    const char = bytes[i];
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}