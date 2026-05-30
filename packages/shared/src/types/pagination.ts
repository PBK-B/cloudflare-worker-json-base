export interface PaginationParams {
	page?: number;
	limit?: number;
	search?: string;
	sort?: string;
	order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
	items: T[];
	total: number;
	page: number;
	limit: number;
	hasMore: boolean;
}
