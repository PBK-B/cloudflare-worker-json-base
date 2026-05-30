import type { PermissionRuleInputDto } from '@jsonbase/shared';
import type { PermissionRuleRecord } from './permission';

export interface PermissionRuleRepository {
	initialize(): Promise<void>;
	list(filters?: { enabled?: boolean; search?: string }): Promise<PermissionRuleRecord[]>;
	getById(id: string): Promise<PermissionRuleRecord | null>;
	create(input: PermissionRuleInputDto): Promise<PermissionRuleRecord>;
	update(id: string, input: PermissionRuleInputDto): Promise<PermissionRuleRecord>;
	setEnabled(id: string, enabled: boolean): Promise<PermissionRuleRecord>;
	delete(id: string): Promise<void>;
}
