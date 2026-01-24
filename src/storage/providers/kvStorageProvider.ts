// KV Storage Provider - Cloudflare KV implementation

import {
  ChunkStorageProvider,
  FileMetadata,
  DEFAULT_CHUNK_SIZE
} from '../interfaces';
import { WorkerEnv } from '../../types';
import { ApiError } from '../../utils/response';

export class KVStorageProvider implements ChunkStorageProvider {
  private kv!: KVNamespace;
  private chunkSize: number;

  constructor(env: WorkerEnv, chunkSize: number = DEFAULT_CHUNK_SIZE) {
    const kv = (env as any).JSONBIN || null;
    this.chunkSize = chunkSize;

    if (!kv) {
      throw ApiError.serviceUnavailable('KV namespace not available. Set STORAGE_BACKEND=d1 to use D1 storage.');
    }
    this.kv = kv;
  }

  getBackendName(): string {
    return 'kv';
  }

  private getChunkKey(handle: string, chunkIndex: number): string {
    return `chunk:${handle}:${chunkIndex.toString().padStart(4, '0')}`;
  }

  async write(data: Uint8Array, metadata: Omit<FileMetadata, 'id' | 'storageBackend'>): Promise<string> {
    const handle = this.generateHandle();
    const chunkCount = Math.ceil(data.length / this.chunkSize);

    // Store each chunk
    for (let i = 0; i < chunkCount; i++) {
      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize, data.length);
      const chunk = data.slice(start, end);

      await this.writeChunk(handle, i, chunk);
    }

    return handle;
  }

  async writeChunk(handle: string, chunkIndex: number, data: Uint8Array): Promise<void> {
    if (!this.kv) throw ApiError.serviceUnavailable('KV namespace not available');
    const key = this.getChunkKey(handle, chunkIndex);
    await this.kv.put(key, data as unknown as string, {
      metadata: { handle, chunkIndex, size: data.length },
      expirationTtl: 60 * 60 * 24 * 30 // 30 days
    });
  }

  async read(handle: string): Promise<Uint8Array> {
    if (!this.kv) throw ApiError.serviceUnavailable('KV namespace not available');
    const chunkCount = await this.getChunkCount(handle);
    
    if (chunkCount === 0) {
      throw ApiError.notFound(`Data not found for handle: ${handle}`);
    }

    const chunks: Uint8Array[] = [];

    for (let i = 0; i < chunkCount; i++) {
      const chunk = await this.readChunk(handle, i);
      chunks.push(chunk);
    }

    return this.mergeChunks(chunks);
  }

  async readChunk(handle: string, chunkIndex: number): Promise<Uint8Array> {
    const key = this.getChunkKey(handle, chunkIndex);
    const data = await this.kv.get(key);

    if (!data) {
      throw ApiError.notFound(`Chunk ${chunkIndex} not found for handle ${handle}`);
    }

    // KV returns string or ArrayBuffer
    if (typeof data === 'string') {
      return new TextEncoder().encode(data);
    }
    return new Uint8Array(data);
  }

  async delete(handle: string): Promise<void> {
    const chunkCount = await this.getChunkCount(handle);
    await this.deleteChunks(handle, chunkCount);
  }

  async deleteChunks(handle: string, chunkCount: number): Promise<void> {
    const keys: string[] = [];
    for (let i = 0; i < chunkCount; i++) {
      keys.push(this.getChunkKey(handle, i));
    }

    // Delete all chunks
    for (const key of keys) {
      await this.kv.delete(key);
    }
  }

  async exists(handle: string): Promise<boolean> {
    const chunkCount = await this.getChunkCount(handle);
    return chunkCount > 0;
  }

  async getChunkCount(handle: string): Promise<number> {
    // Try to get first chunk to check existence
    const firstChunk = await this.kv.get(this.getChunkKey(handle, 0));
    if (!firstChunk) {
      return 0;
    }

    // Binary search for chunk count
    let low = 0;
    let high = 10000; // Reasonable upper limit

    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      const chunk = await this.kv.get(this.getChunkKey(handle, mid));
      if (chunk) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return low + 1;
  }

  private mergeChunks(chunks: Uint8Array[]): Uint8Array {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);

    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  private generateHandle(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

export default KVStorageProvider;