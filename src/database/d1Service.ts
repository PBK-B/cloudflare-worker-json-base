import { D1Database } from '@cloudflare/workers-types';
import { StorageData, CreateDataRequest, UpdateDataRequest, WorkerEnv, PaginatedResponse, PaginationParams } from '../types';
import { Config } from '../utils/config';
import { ApiError } from '../utils/response';
import { Logger } from '../utils/middleware';

const getD1Database = (env: WorkerEnv): D1Database | null => {
	return (env as any).JSONBASE_DB || null;
};

export class D1StorageService {
	private env: WorkerEnv;
	private config: Config;

	constructor(env: WorkerEnv) {
		this.env = env;
		this.config = Config.getInstance(env);
	}

	async getData(pathname: string): Promise<StorageData> {
		const db = getD1Database(this.env);
		if (!db) {
			throw ApiError.internal('D1 database not available');
		}

		const result = await db
			.prepare('SELECT * FROM data_items WHERE id = ?')
			.bind(pathname)
			.first<StorageData>();

		if (!result) {
			throw ApiError.notFound(`Data not found at path: ${pathname}`);
		}

		Logger.debug('Retrieved data', { pathname, size: result.size });
		return result;
	}

	async createData(pathname: string, request: CreateDataRequest): Promise<StorageData> {
		const db = getD1Database(this.env);
		if (!db) {
			throw ApiError.internal('D1 database not available');
		}

		const existing = await db
			.prepare('SELECT id FROM data_items WHERE id = ?')
			.bind(pathname)
			.first();

		if (existing) {
			throw ApiError.badRequest(`Data already exists at path: ${pathname}`);
		}

		const now = new Date().toISOString();
		const type = request.type || 'json';
		let value = request.value;
		let contentType = request.contentType;

		if (type === 'json') {
			value = JSON.stringify(request.value);
			contentType = contentType || 'application/json';
		} else if (type === 'binary') {
			if (typeof request.value === 'string' && request.value.startsWith('data:')) {
				contentType = contentType || request.value.split(';')[0].split(':')[1];
			} else {
				contentType = contentType || 'application/octet-stream';
			}
		} else {
			value = String(request.value);
			contentType = contentType || 'text/plain';
		}

		const size = new Blob([value as string]).size;

		await db
			.prepare(
				`INSERT INTO data_items (id, value, type, content_type, size, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(pathname, value as string, type, contentType, size, now, now)
			.run();

		Logger.info('Data created', { pathname, type, size });

		return {
			id: pathname,
			value,
			type,
			createdAt: now,
			updatedAt: now,
			size,
			contentType,
		};
	}

	async updateData(pathname: string, request: UpdateDataRequest): Promise<StorageData> {
		const db = getD1Database(this.env);
		if (!db) {
			throw ApiError.internal('D1 database not available');
		}

		const existing = await db
			.prepare('SELECT * FROM data_items WHERE id = ?')
			.bind(pathname)
			.first<StorageData>();

		if (!existing) {
			throw ApiError.notFound(`Data not found at path: ${pathname}`);
		}

		const now = new Date().toISOString();
		const type = request.type || existing.type;
		let value = request.value;
		let contentType = request.contentType || existing.contentType;

		if (type === 'json') {
			value = JSON.stringify(request.value);
			contentType = contentType || 'application/json';
		} else if (type === 'binary') {
			if (typeof request.value === 'string' && request.value.startsWith('data:')) {
				contentType = contentType || request.value.split(';')[0].split(':')[1];
			} else {
				contentType = contentType || 'application/octet-stream';
			}
		} else {
			value = String(request.value);
			contentType = contentType || 'text/plain';
		}

		const size = new Blob([value as string]).size;

		await db
			.prepare(
				`UPDATE data_items
         SET value = ?, type = ?, content_type = ?, size = ?, updated_at = ?
         WHERE id = ?`
			)
			.bind(value as string, type, contentType, size, now, pathname)
			.run();

		Logger.info('Data updated', { pathname, type, size });

		return {
			id: pathname,
			value,
			type,
			createdAt: existing.createdAt,
			updatedAt: now,
			size,
			contentType,
		};
	}

	async upsertData(pathname: string, request: CreateDataRequest | UpdateDataRequest): Promise<StorageData> {
		const db = getD1Database(this.env);
		if (!db) {
			throw ApiError.internal('D1 database not available');
		}

		const existing = await db
			.prepare('SELECT * FROM data_items WHERE id = ?')
			.bind(pathname)
			.first<StorageData>();

		if (existing) {
			return this.updateData(pathname, request);
		} else {
			return this.createData(pathname, request);
		}
	}

	async deleteData(pathname: string): Promise<void> {
		const db = getD1Database(this.env);
		if (!db) {
			throw ApiError.internal('D1 database not available');
		}

		const result = await db
			.prepare('DELETE FROM data_items WHERE id = ?')
			.bind(pathname)
			.run();

		const deleteResult = result as unknown as { changes: number };
		if (deleteResult.changes === 0) {
			throw ApiError.notFound(`Data not found at path: ${pathname}`);
		}

		Logger.info('Data deleted', { pathname });
	}

	async listData(params: PaginationParams = {}): Promise<PaginatedResponse<StorageData>> {
		const db = getD1Database(this.env);
		if (!db) {
			throw ApiError.internal('D1 database not available');
		}

		const { search, page = 1, limit = 20, sort = 'updated_at', order = 'desc' } = params;
		const offset = (page - 1) * limit;

		let countQuery = 'SELECT COUNT(*) as total FROM data_items';
		let dataQuery = 'SELECT * FROM data_items';

		const queryParams: string[] = [];

		if (search) {
			const searchCondition = ' WHERE id LIKE ? OR value LIKE ?';
			countQuery += searchCondition;
			dataQuery += searchCondition;
			const searchPattern = `%${search}%`;
			queryParams.push(searchPattern, searchPattern);
		}

		const sortColumn = sort === 'id' ? 'id' : 'updated_at';
		const sortOrder = order.toUpperCase();
		dataQuery += ` ORDER BY ${sortColumn} ${sortOrder} LIMIT ? OFFSET ?`;
		queryParams.push(limit.toString(), offset.toString());

		const [countResult, dataResult] = await Promise.all([
			db.prepare(countQuery).bind(...(search ? [`%${search}%`, `%${search}%`] : [])).first<{ total: number }>(),
			db.prepare(dataQuery).bind(...queryParams).all<StorageData>(),
		]);

		const total = countResult?.total || 0;
		const items = (dataResult.results as StorageData[]) || [];
		const hasMore = offset + items.length < total;

		Logger.debug('Data listed', { total, page, limit, count: items.length });

		return { items, total, page, limit, hasMore };
	}

	async getHealth(): Promise<{ status: string; db: boolean; timestamp: string }> {
		const db = getD1Database(this.env);
		const dbAvailable = !!db;

		if (dbAvailable) {
			try {
				await db.prepare('SELECT 1').first();
			} catch (error) {
				Logger.warn('D1 health check failed', { error });
			}
		}

		return {
			status: dbAvailable ? 'healthy' : 'unhealthy',
			db: dbAvailable,
			timestamp: new Date().toISOString(),
		};
	}
}

export default D1StorageService;
