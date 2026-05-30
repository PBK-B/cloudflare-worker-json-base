import type { AppContainer } from './createContainer';

export interface RequestContext {
	requestId: string;
	container: AppContainer;
	request: Request;
	url: URL;
}

export function createRequestContext(container: AppContainer, request: Request): RequestContext {
	return {
		requestId: crypto.randomUUID(),
		container,
		request,
		url: new URL(request.url)
	};
}
