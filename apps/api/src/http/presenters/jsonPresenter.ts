import type { ApiResponse } from '@jsonbase/shared';

export function jsonPresenter<T>(payload: ApiResponse<T>, status = 200): Response {
	return new Response(JSON.stringify(payload, null, 2), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store'
		}
	});
}
