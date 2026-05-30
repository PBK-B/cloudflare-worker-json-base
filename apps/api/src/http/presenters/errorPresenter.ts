import { jsonPresenter } from './jsonPresenter';
import { AppError } from '../../shared/errors/appError';

export function errorPresenter(error: unknown): Response {
	if (error instanceof AppError) {
		return jsonPresenter(
			{
				success: false,
				error: error.message,
				message: error.code,
				timestamp: new Date().toISOString()
			},
			error.statusCode
		);
	}

	return jsonPresenter(
		{
			success: false,
			error: error instanceof Error ? error.message : 'Internal Server Error',
			message: 'INTERNAL_ERROR',
			timestamp: new Date().toISOString()
		},
		500
	);
}
