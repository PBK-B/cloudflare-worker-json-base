import type { PaginatedResponse, ResourceDto } from '@jsonbase/shared';
import type { ResourceListParams, ResourceMetadataRecord } from './resource';

export interface ResourceMetadataRepository {
	initialize(): Promise<void>;
	get(path: string): Promise<ResourceMetadataRecord | null>;
	set(record: ResourceMetadataRecord): Promise<void>;
	delete(path: string): Promise<void>;
	listMetadata(params: ResourceListParams): Promise<PaginatedResponse<ResourceMetadataRecord>>;
	list(params: ResourceListParams): Promise<PaginatedResponse<ResourceDto>>;
	stats(): Promise<{ totalCount: number; totalSize: number }>;
}

export interface ResourceContentStore {
	get(contentKey: string): Promise<Uint8Array | null>;
	set(contentKey: string, content: Uint8Array): Promise<void>;
	delete(contentKey: string): Promise<void>;
}
