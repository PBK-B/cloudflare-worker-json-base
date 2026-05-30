import type { PaginatedResponse, ResourceDto } from '@jsonbase/shared';
import { jsonPresenter } from './jsonPresenter';
import type { ResourceRecord } from '../../modules/resource/domain/resource';

export function resourceListPresenter(payload: PaginatedResponse<ResourceDto>): Response {
	return jsonPresenter({ success: true, data: payload, timestamp: new Date().toISOString() });
}

export function adminResourcePresenter(resource: ResourceRecord): Response {
	return jsonPresenter({
		success: true,
		data: toResourceDto(resource, true),
		timestamp: new Date().toISOString()
	});
}

export function publicResourcePresenter(resource: ResourceRecord, method: string): Response {
	const headers = new Headers({
		'Content-Type': resource.contentType,
		'Content-Length': String(resource.size),
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff'
	});

	if (method === 'HEAD') {
		return new Response(null, { status: 200, headers });
	}

	const body = new Uint8Array(resource.content.byteLength);
	body.set(resource.content);

	return new Response(body as unknown as BodyInit, { status: 200, headers });
}

function toResourceDto(resource: ResourceRecord, includeValue: boolean): ResourceDto {
	const dto: ResourceDto = {
		path: resource.path,
		type: resource.type,
		contentType: resource.contentType,
		size: resource.size,
		createdAt: resource.createdAt,
		updatedAt: resource.updatedAt
	};

	if (includeValue) {
		if (resource.type === 'json') {
			const text = new TextDecoder().decode(resource.content);
			dto.value = JSON.parse(text);
		} else if (resource.type === 'text') {
			dto.value = new TextDecoder().decode(resource.content);
		} else {
			dto.value = null;
		}
	}

	return dto;
}
