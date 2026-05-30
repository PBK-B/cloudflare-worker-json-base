import type { D1Database } from '@cloudflare/workers-types';
import type { PaginatedResponse, ResourceDto } from '@jsonbase/shared';
import type { ResourceListParams, ResourceMetadataRecord } from '../domain/resource';
import type { ResourceMetadataRepository } from '../domain/resourceRepository';
import { AppError } from '../../../shared/errors/appError';

interface ResourceRow {
	path: string;
	type: string;
	content_type: string;
	size: number;
	content_key: string;
	created_at: string;
	updated_at: string;
}

export class D1ResourceMetadataRepository implements ResourceMetadataRepository {
	constructor(private readonly db: D1Database | undefined) {}

	async initialize(): Promise<void> {
		if (!this.db) {
			throw AppError.internal('D1 database not available');
		}

		await this.db.prepare(`
			CREATE TABLE IF NOT EXISTS resources (
				path TEXT PRIMARY KEY,
				type TEXT NOT NULL,
				content_type TEXT NOT NULL,
				size INTEGER NOT NULL,
				content_key TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`).run();

		await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_resources_updated_at ON resources(updated_at DESC)`).run();
		await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_resources_size ON resources(size)`).run();
	}

	async get(path: string): Promise<ResourceMetadataRecord | null> {
		if (!this.db) {
			throw AppError.internal('D1 database not available');
		}

		const row = await this.db.prepare(`SELECT * FROM resources WHERE path = ?1`).bind(path).first<ResourceRow>();
		return row ? this.mapRow(row) : null;
	}

	async set(record: ResourceMetadataRecord): Promise<void> {
		if (!this.db) {
			throw AppError.internal('D1 database not available');
		}

		await this.db.prepare(`
			INSERT OR REPLACE INTO resources (path, type, content_type, size, content_key, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
		`).bind(
			record.path,
			record.type,
			record.contentType,
			record.size,
			record.contentKey,
			record.createdAt,
			record.updatedAt
		).run();
	}

	async delete(path: string): Promise<void> {
		if (!this.db) {
			throw AppError.internal('D1 database not available');
		}

		await this.db.prepare(`DELETE FROM resources WHERE path = ?1`).bind(path).run();
	}

	async list(params: ResourceListParams): Promise<PaginatedResponse<ResourceDto>> {
		const metadataPage = await this.listMetadata(params);
		return {
			...metadataPage,
			items: metadataPage.items.map((record) => ({
				path: record.path,
				type: record.type,
				contentType: record.contentType,
				size: record.size,
				createdAt: record.createdAt,
				updatedAt: record.updatedAt
			}))
		};
	}

	async listMetadata(params: ResourceListParams): Promise<PaginatedResponse<ResourceMetadataRecord>> {
		if (!this.db) {
			throw AppError.internal('D1 database not available');
		}

		const page = Math.max(params.page || 1, 1);
		const limit = Math.min(Math.max(params.limit || 20, 1), 1000);
		const offset = (page - 1) * limit;
		const sortField = params.sort === 'path' ? 'path' : params.sort === 'size' ? 'size' : 'updated_at';
		const sortOrder = params.order === 'asc' ? 'ASC' : 'DESC';

		const conditions: string[] = [];
		const values: string[] = [];

		if (params.prefix) {
			conditions.push('path LIKE ?');
			values.push(`${params.prefix}%`);
		}

		if (params.search) {
			conditions.push('(path LIKE ? OR content_type LIKE ?)');
			values.push(`%${params.search}%`, `%${params.search}%`);
		}

		const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
		const countQuery = `SELECT COUNT(*) as total FROM resources${whereClause}`;
		const dataQuery = `SELECT * FROM resources${whereClause} ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`;

		const countRow = await this.db.prepare(countQuery).bind(...values).first<{ total: number }>();
		const rows = await this.db.prepare(dataQuery).bind(...values, limit, offset).all<ResourceRow>();

		const items = (rows.results || []).map((row) => this.mapRow(row));

		const total = countRow?.total || 0;
		return {
			items,
			total,
			page,
			limit,
			hasMore: offset + items.length < total
		};
	}

	async stats(): Promise<{ totalCount: number; totalSize: number }> {
		if (!this.db) {
			throw AppError.internal('D1 database not available');
		}

		const row = await this.db.prepare(`SELECT COUNT(*) as total_count, COALESCE(SUM(size), 0) as total_size FROM resources`).first<{
			total_count: number;
			total_size: number;
		}>();

		return {
			totalCount: row?.total_count || 0,
			totalSize: row?.total_size || 0
		};
	}

	private mapRow(row: ResourceRow): ResourceMetadataRecord {
		return {
			path: row.path,
			type: row.type as ResourceMetadataRecord['type'],
			contentType: row.content_type,
			size: row.size,
			contentKey: row.content_key,
			createdAt: row.created_at,
			updatedAt: row.updated_at
		};
	}
}
