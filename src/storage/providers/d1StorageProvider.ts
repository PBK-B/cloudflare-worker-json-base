// D1 Storage Provider - Cloudflare D1 implementation

import {
  ChunkStorageProvider,
  FileMetadata,
  DEFAULT_CHUNK_SIZE,
  calculateChunkCount
} from '../interfaces';
import { WorkerEnv } from '../../types';
import { ApiError } from '../../utils/response';

export class D1StorageProvider implements ChunkStorageProvider {
  private db: any;
  private chunkSize: number;

  constructor(env: WorkerEnv, chunkSize: number = DEFAULT_CHUNK_SIZE) {
    this.db = (env as any).JSONBASE_DB || null;
    this.chunkSize = chunkSize;

    if (!this.db) {
      throw ApiError.serviceUnavailable('D1 database not available');
    }
  }

  async initialize(): Promise<void> {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS data_chunks (
        handle TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        data TEXT NOT NULL,
        size INTEGER NOT NULL,
        total_chunks INTEGER,
        created_at TEXT NOT NULL,
        PRIMARY KEY (handle, chunk_index)
      )
    `).run();
  }

  getBackendName(): string {
    return 'd1';
  }

  private getChunkKey(handle: string, chunkIndex: number): string {
    return `chunk:${handle}:${chunkIndex.toString().padStart(4, '0')}`;
  }

  async write(data: Uint8Array, metadata: Omit<FileMetadata, 'id' | 'storageBackend'>): Promise<string> {
    const fullMetadata = metadata as FileMetadata;
    const handle = fullMetadata.id || this.generateHandle();
    const chunkCount = Math.ceil(data.length / this.chunkSize);

    const now = new Date().toISOString();
    const totalSize = data.length;

    try {
      for (let i = 0; i < chunkCount; i++) {
        const start = i * this.chunkSize;
        const end = Math.min(start + this.chunkSize, data.length);
        const chunkData = data.slice(start, end);
        const base64Value = this.uint8ArrayToBase64(chunkData);

        await this.db
          .prepare(
            `INSERT INTO data_chunks (handle, chunk_index, data, size, total_chunks, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .bind(handle, i, base64Value, chunkData.length, chunkCount, now)
          .run();
      }

      return handle;
    } catch (error) {
      console.error('D1StorageProvider.write error:', error);
      throw error;
    }
  }

  async writeChunk(handle: string, chunkIndex: number, data: Uint8Array): Promise<void> {
    const base64Value = this.uint8ArrayToBase64(data);
    
    await this.db
      .prepare(
        `INSERT INTO data_chunks (handle, chunk_index, data, size, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(handle, chunkIndex, base64Value, data.length, new Date().toISOString())
      .run();
  }

  async read(handle: string): Promise<Uint8Array> {
    try {
      const result = await this.db
        .prepare('SELECT data, size FROM data_chunks WHERE handle = ? ORDER BY chunk_index')
        .bind(handle)
        .all();

      if (!result.results || result.results.length === 0) {
        throw ApiError.notFound(`Data not found for handle: ${handle}`);
      }

      let totalLength = 0;
      for (const row of result.results) {
        totalLength += row.size;
      }

      const chunks: Uint8Array[] = [];

      for (const row of result.results) {
        const chunk = this.base64ToUint8Array(row.data);
        chunks.push(chunk);
      }

      return this.mergeChunks(chunks);
    } catch (error) {
      console.error('D1StorageProvider.read error:', error);
      throw error;
    }
  }

  async readChunk(handle: string, chunkIndex: number): Promise<Uint8Array> {
    const result = await this.db
      .prepare('SELECT data, size FROM data_chunks WHERE handle = ? AND chunk_index = ?')
      .bind(handle, chunkIndex)
      .first();

    if (!result) {
      throw ApiError.notFound(`Chunk ${chunkIndex} not found for handle ${handle}`);
    }

    return this.base64ToUint8Array(result.data);
  }

  private uint8ArrayToBase64(data: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async delete(handle: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM data_chunks WHERE handle = ?')
      .bind(handle)
      .run();
  }

  async deleteChunks(handle: string, chunkCount: number): Promise<void> {
    await this.delete(handle);
  }

  async exists(handle: string): Promise<boolean> {
    const result = await this.db
      .prepare('SELECT 1 FROM data_chunks WHERE handle = ? LIMIT 1')
      .bind(handle)
      .first();
    return !!result;
  }

  async getChunkCount(handle: string): Promise<number> {
    const result = await this.db
      .prepare('SELECT COUNT(*) as count FROM data_chunks WHERE handle = ?')
      .bind(handle)
      .first();
    return result?.count || 0;
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

export default D1StorageProvider;
