export class AppError extends Error {
	readonly statusCode: number;
	readonly code: string;
	readonly details?: unknown;

	constructor(statusCode: number, code: string, message: string, details?: unknown) {
		super(message);
		this.name = 'AppError';
		this.statusCode = statusCode;
		this.code = code;
		this.details = details;
	}

	static badRequest(message: string, details?: unknown): AppError {
		return new AppError(400, 'BAD_REQUEST', message, details);
	}

	static unauthorized(message = 'Unauthorized'): AppError {
		return new AppError(401, 'UNAUTHORIZED', message);
	}

	static forbidden(message = 'Forbidden'): AppError {
		return new AppError(403, 'FORBIDDEN', message);
	}

	static notFound(message = 'Not Found'): AppError {
		return new AppError(404, 'NOT_FOUND', message);
	}

	static methodNotAllowed(message = 'Method Not Allowed'): AppError {
		return new AppError(405, 'METHOD_NOT_ALLOWED', message);
	}

	static internal(message = 'Internal Server Error', details?: unknown): AppError {
		return new AppError(500, 'INTERNAL_ERROR', message, details);
	}

	static notImplemented(message = 'Not Implemented'): AppError {
		return new AppError(501, 'NOT_IMPLEMENTED', message);
	}
}
