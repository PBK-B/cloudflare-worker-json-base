export type ResourceType = 'json' | 'text' | 'binary';

export interface ResourceMetadataRecord {
	path: string;
	type: ResourceType;
	contentType: string;
	size: number;
	contentKey: string;
	createdAt: string;
	updatedAt: string;
}

export interface ResourceRecord extends ResourceMetadataRecord {
	content: Uint8Array;
}

export interface ResourceListParams {
	prefix?: string;
	search?: string;
	page?: number;
	limit?: number;
	sort?: 'path' | 'size' | 'updatedAt';
	order?: 'asc' | 'desc';
}
