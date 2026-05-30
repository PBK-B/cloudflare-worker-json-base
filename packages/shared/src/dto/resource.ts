export type ResourceType = 'json' | 'text' | 'binary';

export interface ResourceDto {
	path: string;
	type: ResourceType;
	contentType: string;
	size: number;
	createdAt: string;
	updatedAt: string;
	value?: unknown;
}

export interface CreateResourceRequestDto {
	value: unknown;
	type?: ResourceType;
	contentType?: string;
}

export interface UpdateResourceRequestDto {
	value: unknown;
	type?: ResourceType;
	contentType?: string;
}
