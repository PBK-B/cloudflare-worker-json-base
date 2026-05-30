import type { ResourceContentStore } from '../domain/resourceRepository';
import { AppError } from '../../../shared/errors/appError';

export class KvResourceContentStore implements ResourceContentStore {
	constructor(private readonly kv: KVNamespace | undefined) {}

	async get(contentKey: string): Promise<Uint8Array | null> {
		if (!this.kv) {
			throw AppError.internal('KV namespace not available');
		}

		const value = await this.kv.get(contentKey, 'arrayBuffer');
		return value ? new Uint8Array(value) : null;
	}

	async set(contentKey: string, content: Uint8Array): Promise<void> {
		if (!this.kv) {
			throw AppError.internal('KV namespace not available');
		}

		await this.kv.put(contentKey, content);
	}

	async delete(contentKey: string): Promise<void> {
		if (!this.kv) {
			throw AppError.internal('KV namespace not available');
		}

		await this.kv.delete(contentKey);
	}
}
