import type { D1Database } from '@cloudflare/workers-types';
import type { PermissionRuleInputDto } from '@jsonbase/shared';
import type { PermissionRuleRecord } from '../domain/permission';
import type { PermissionRuleRepository } from '../domain/permissionRepository';
import { AppError } from '../../../shared/errors/appError';

interface PermissionRuleRow {
	id: string;
	pattern: string;
	mode: string;
	priority: number;
	enabled: number;
	description: string | null;
	created_at: string;
	updated_at: string;
}

export class D1PermissionRuleRepository implements PermissionRuleRepository {
	constructor(private readonly db: D1Database | undefined) {}

	async initialize(): Promise<void> {
		if (!this.db) {
			throw AppError.internal('D1 database not available');
		}

		await this.db.prepare(`
			CREATE TABLE IF NOT EXISTS permission_rules (
				id TEXT PRIMARY KEY,
				pattern TEXT NOT NULL,
				mode TEXT NOT NULL,
				priority INTEGER NOT NULL,
				enabled INTEGER NOT NULL,
				description TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`).run();

		await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_permission_rules_priority ON permission_rules(priority DESC, updated_at DESC)`).run();
	}

	async list(filters: { enabled?: boolean; search?: string } = {}): Promise<PermissionRuleRecord[]> {
		if (!this.db) {
			throw AppError.internal('D1 database not available');
		}

		const clauses: string[] = [];
		const values: Array<string | number> = [];

		if (typeof filters.enabled === 'boolean') {
			clauses.push('enabled = ?');
			values.push(filters.enabled ? 1 : 0);
		}

		if (filters.search) {
			clauses.push('(pattern LIKE ? OR description LIKE ?)');
			values.push(`%${filters.search}%`, `%${filters.search}%`);
		}

		const whereClause = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
		const query = `SELECT * FROM permission_rules${whereClause} ORDER BY priority DESC, updated_at DESC, created_at DESC`;
		const result = await this.db.prepare(query).bind(...values).all<PermissionRuleRow>();
		return (result.results || []).map((row) => this.mapRow(row));
	}

	async getById(id: string): Promise<PermissionRuleRecord | null> {
		if (!this.db) {
			throw AppError.internal('D1 database not available');
		}

		const row = await this.db.prepare(`SELECT * FROM permission_rules WHERE id = ?1`).bind(id).first<PermissionRuleRow>();
		return row ? this.mapRow(row) : null;
	}

	async create(input: PermissionRuleInputDto): Promise<PermissionRuleRecord> {
		if (!this.db) {
			throw AppError.internal('D1 database not available');
		}

		const now = new Date().toISOString();
		const record: PermissionRuleRecord = {
			id: crypto.randomUUID(),
			pattern: input.pattern,
			mode: input.mode,
			priority: input.priority,
			enabled: input.enabled !== false,
			description: input.description,
			createdAt: now,
			updatedAt: now
		};

		await this.db.prepare(`
			INSERT INTO permission_rules (id, pattern, mode, priority, enabled, description, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
		`).bind(
			record.id,
			record.pattern,
			record.mode,
			record.priority,
			record.enabled ? 1 : 0,
			record.description || null,
			record.createdAt,
			record.updatedAt
		).run();

		return record;
	}

	async update(id: string, input: PermissionRuleInputDto): Promise<PermissionRuleRecord> {
		const existing = await this.getById(id);
		if (!existing) {
			throw AppError.notFound('Permission rule not found');
		}

		const updated: PermissionRuleRecord = {
			...existing,
			pattern: input.pattern,
			mode: input.mode,
			priority: input.priority,
			enabled: input.enabled !== false,
			description: input.description,
			updatedAt: new Date().toISOString()
		};

		await this.write(updated);
		return updated;
	}

	async setEnabled(id: string, enabled: boolean): Promise<PermissionRuleRecord> {
		const existing = await this.getById(id);
		if (!existing) {
			throw AppError.notFound('Permission rule not found');
		}

		const updated: PermissionRuleRecord = {
			...existing,
			enabled,
			updatedAt: new Date().toISOString()
		};

		await this.write(updated);
		return updated;
	}

	async delete(id: string): Promise<void> {
		if (!this.db) {
			throw AppError.internal('D1 database not available');
		}

		await this.db.prepare(`DELETE FROM permission_rules WHERE id = ?1`).bind(id).run();
	}

	private async write(record: PermissionRuleRecord): Promise<void> {
		if (!this.db) {
			throw AppError.internal('D1 database not available');
		}

		await this.db.prepare(`
			UPDATE permission_rules
			SET pattern = ?2, mode = ?3, priority = ?4, enabled = ?5, description = ?6, updated_at = ?7
			WHERE id = ?1
		`).bind(
			record.id,
			record.pattern,
			record.mode,
			record.priority,
			record.enabled ? 1 : 0,
			record.description || null,
			record.updatedAt
		).run();
	}

	private mapRow(row: PermissionRuleRow): PermissionRuleRecord {
		return {
			id: row.id,
			pattern: row.pattern,
			mode: row.mode as PermissionRuleRecord['mode'],
			priority: row.priority,
			enabled: row.enabled === 1,
			description: row.description || undefined,
			createdAt: row.created_at,
			updatedAt: row.updated_at
		};
	}
}
