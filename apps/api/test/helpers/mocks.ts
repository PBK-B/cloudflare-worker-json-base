import type { WorkerEnv } from '../../src/infrastructure/config/runtimeConfig';

class MockD1PreparedStatement {
	constructor(private readonly db: MockD1Database, private readonly query: string, private readonly bindings: unknown[] = []) {}

	bind(...values: unknown[]): MockD1PreparedStatement {
		return new MockD1PreparedStatement(this.db, this.query, values);
	}

	async run(): Promise<{ success: boolean; changes?: number }> {
		return this.db.run(this.query, this.bindings);
	}

	async first<T>(): Promise<T | null> {
		return this.db.first(this.query, this.bindings) as T | null;
	}

	async all<T>(): Promise<{ results: T[] }> {
		return { results: this.db.all(this.query, this.bindings) as T[] };
	}
}

export class MockD1Database {
	private resources = new Map<string, any>();
	private permissionRules = new Map<string, any>();

	prepare(query: string): MockD1PreparedStatement {
		return new MockD1PreparedStatement(this, query);
	}

	run(query: string, values: unknown[]): { success: boolean; changes?: number } {
		if (query.includes('INSERT OR REPLACE INTO resources')) {
			const [path, type, contentType, size, contentKey, createdAt, updatedAt] = values as string[];
			this.resources.set(path, {
				path,
				type,
				content_type: contentType,
				size,
				content_key: contentKey,
				created_at: createdAt,
				updated_at: updatedAt
			});
			return { success: true, changes: 1 };
		}

		if (query.includes('DELETE FROM resources')) {
			const [path] = values as string[];
			const existed = this.resources.delete(path);
			return { success: true, changes: existed ? 1 : 0 };
		}

		if (query.includes('INSERT INTO permission_rules')) {
			const [id, pattern, mode, priority, enabled, description, createdAt, updatedAt] = values as [string, string, string, number, number, string | null, string, string];
			this.permissionRules.set(id, {
				id,
				pattern,
				mode,
				priority,
				enabled,
				description,
				created_at: createdAt,
				updated_at: updatedAt
			});
			return { success: true, changes: 1 };
		}

		if (query.includes('UPDATE permission_rules')) {
			const [id, pattern, mode, priority, enabled, description, updatedAt] = values as [string, string, string, number, number, string | null, string];
			const existing = this.permissionRules.get(id);
			if (!existing) {
				return { success: true, changes: 0 };
			}
			this.permissionRules.set(id, { ...existing, pattern, mode, priority, enabled, description, updated_at: updatedAt });
			return { success: true, changes: 1 };
		}

		if (query.includes('DELETE FROM permission_rules')) {
			const [id] = values as string[];
			const existed = this.permissionRules.delete(id);
			return { success: true, changes: existed ? 1 : 0 };
		}

		return { success: true, changes: 0 };
	}

	first(query: string, values: unknown[]): unknown {
		if (query.includes('SELECT * FROM resources WHERE path')) {
			return this.resources.get(values[0] as string) || null;
		}

		if (query.includes('SELECT COUNT(*) as total FROM resources')) {
			return { total: this.resources.size };
		}

		if (query.includes('SELECT COUNT(*) as total_count')) {
			let totalSize = 0;
			for (const item of this.resources.values()) {
				totalSize += item.size;
			}
			return { total_count: this.resources.size, total_size: totalSize };
		}

		if (query.includes('SELECT * FROM permission_rules WHERE id')) {
			return this.permissionRules.get(values[0] as string) || null;
		}

		return null;
	}

	all(query: string, values: unknown[]): unknown[] {
		if (query.includes('SELECT * FROM resources')) {
			let items = Array.from(this.resources.values());
			const stringValues = values.filter((value) => typeof value === 'string') as string[];
			if (query.includes('path LIKE ?') && stringValues.length > 0) {
				const prefix = stringValues[0].replace(/%$/, '');
				items = items.filter((item) => item.path.startsWith(prefix));
			}
			if (query.includes('(path LIKE ? OR content_type LIKE ?)') && stringValues.length >= 2) {
				const search = stringValues[stringValues.length - 2].replace(/%/g, '').toLowerCase();
				items = items.filter((item) => item.path.toLowerCase().includes(search) || item.content_type.toLowerCase().includes(search));
			}
			if (query.includes('ORDER BY size')) {
				items.sort((a, b) => b.size - a.size);
			} else if (query.includes('ORDER BY path')) {
				items.sort((a, b) => a.path.localeCompare(b.path));
			} else {
				items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
			}
			const limit = Number(values[values.length - 2] || items.length);
			const offset = Number(values[values.length - 1] || 0);
			return items.slice(offset, offset + limit);
		}

		if (query.includes('SELECT * FROM permission_rules')) {
			return Array.from(this.permissionRules.values()).sort((a, b) => b.priority - a.priority || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
		}

		return [];
	}
}

export class MockKVNamespace {
	private store = new Map<string, Uint8Array | string>();

	async get(key: string, type?: 'arrayBuffer' | 'json'): Promise<any> {
		const value = this.store.get(key);
		if (!value) {
			return null;
		}

		if (type === 'arrayBuffer') {
			if (typeof value === 'string') {
				return new TextEncoder().encode(value).buffer;
			}
			return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
		}

		if (type === 'json') {
			return typeof value === 'string' ? JSON.parse(value) : JSON.parse(new TextDecoder().decode(value));
		}

		return typeof value === 'string' ? value : new TextDecoder().decode(value);
	}

	async put(key: string, value: string | Uint8Array, _options?: unknown): Promise<void> {
		this.store.set(key, value);
	}

	async delete(key: string): Promise<void> {
		this.store.delete(key);
	}
}


export function createMockEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
	return {
		JSONBASE_DB: new MockD1Database() as unknown as D1Database,
		JSONBIN: new MockKVNamespace() as unknown as KVNamespace,
		WEBUI: {
			fetch: async () => new Response('web asset', { status: 200 })
		} as unknown as Fetcher,
		API_KEY: 'test-api-key',
		ENVIRONMENT: 'test',
		VERSION: '3.0.0',
		STORAGE_BACKEND: 'd1',
		WEB_BASE_PATH: '/dash',
		API_BASE_PATH: '/._jsondb_/api',
		RESOURCE_BASE_PATH: '/',
		RATE_LIMIT_ENABLED: false,
		...overrides
	};
}
