/*
 * @Author: Bin
 * @Date: 2024-05-10
 * @FilePath: /worker-json-base/src/index.js
 */
// @ts-nocheck
/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// link: https://www.owenyoung.com/blog/jsonbin/

// Modify this
const APIKEY = 'MYDATABASEKEY';

export default {
	async fetch(request, env) {
		try {
			const responseBody = await handleRequest(request, env);
			// 判断是否为文件类型
			try {
				let file = await dataUrlToBytes(responseBody);
				return new Response(
					new File([file.arrayBuffer], `${new Date().getTime()}${file.type && '.' + file.type.split('/')[1]}`, {
						type: file.type,
					}),
					{
						headers: {
							'Content-Length': file.arrayBuffer.byteLength,
							'Content-Type': file.type,
						},
					}
				);
			} catch (error) {
				return new Response(responseBody, {
					headers: {
						'Content-Type': 'application/json',
					},
				});
			}
		} catch (e) {
			return errorToResponse(e);
		}
	},
};

// bytes to base64
function arrayBufferToBase64(buffer, chunkSize = 1024) {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		let chunkBinary = '';
		for (let j = 0; j < chunk.length; j++) {
			chunkBinary += String.fromCharCode(chunk[j]);
		}
		binary += chunkBinary;
	}
	return btoa(binary);
}

// base64 to bytes
function base64ToArrayBuffer(base64) {
	let binary_string = atob(base64);
	const len = binary_string.length;
	let bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binary_string.charCodeAt(i);
	}
	return bytes.buffer;
}

async function dataUrlToBytes(dataUrl) {
	let url = new URL(dataUrl);
	if (url.protocol !== 'data:') {
		throw Error('url not is DataURL');
	}
	let sections = url.pathname.split(';base64,');
	if (sections.length < 2) {
		throw Error('DataUrl wrong format');
	}
	let type = sections[0];
	let base64 = sections[1];
	// const res = await fetch(dataUrl);
	// return new Uint8Array(await res.arrayBuffer());
	return {
		type,
		arrayBuffer: base64ToArrayBuffer(base64),
	};
}

function bytesToDataUrl(bytes, type = 'application/octet-stream') {
	let base64 = arrayBufferToBase64(bytes);
	return `data:${type};base64,${base64}`;
}

async function handleRequest(request, env) {
	if (!env.JSONBIN) {
		throw new HTTPError('kvNotFound', 'Not Found KV Database Bind', 500, 'Internal Server Error');
	}

	// first check if the request is authorized
	const { headers } = request;
	const urlObj = new URL(request.url);
	const authorization = headers.get('Authorization');
	const headerAuthorizationValue = `Bearer ${APIKEY}`;
	if (authorization) {
		if (authorization !== headerAuthorizationValue) {
			// if not authorized, return 401
			throw new HTTPError('unauthorized', 'Authrorization Bearer abc is required', 401, 'Unauthorized');
		}
	} else if (urlObj.searchParams.has('key')) {
		const keyFromQuery = urlObj.searchParams.get('key');
		if (keyFromQuery !== APIKEY) {
			// if not authorized, return 401
			throw new HTTPError('unauthorized', 'search query key=abc is required', 401, 'Unauthorized');
		}
	} else {
		throw new HTTPError('unauthorized', 'Authrorization Bearer abc or search query key=abc is required', 401, 'Unauthorized');
	}

	// yes authorized, continue
	if (request.method === 'POST' || request.method === 'PUT') {
		const { pathname } = new URL(request.url);
		let blob = await request.blob();
		let json = '';
		try {
			// storage json object
			let obj = JSON.parse(await blob.text());
			json = JSON.stringify(obj);
		} catch (e) {
			if (blob) {
				// storage binary base64
				let arrayBuffer = await blob.arrayBuffer();
				let base64Url = bytesToDataUrl(arrayBuffer, blob.type);
				json = base64Url;
			} else {
				throw new HTTPError('jsonParseError', 'request body JSON is not valid, ' + e.message, 400, 'Bad Request');
			}
		}
		await env.JSONBIN.put(pathname, json);
		return '{ "status": 1, "message": "storage ok" }';
	} else if (request.method === 'GET') {
		const { pathname } = new URL(request.url);
		const value = await env.JSONBIN.get(pathname);
		if (value === null) {
			throw new HTTPError('notFound', 'Not Found', 404, 'The requested resource was not found');
		}
		return value;
	} else {
		throw new HTTPError('methodNotAllowed', 'Method Not Allowed', 405, 'The requested method is not allowed');
	}
}

function errorToResponse(error) {
	const bodyJson = {
		ok: false,
		error: 'Internal Server Error',
		message: 'Internal Server Error',
	};
	let status = 500;
	let statusText = 'Internal Server Error';

	if (error instanceof Error) {
		bodyJson.message = error.message;
		bodyJson.error = error.name;

		if (error.status) {
			status = error.status;
		}
		if (error.statusText) {
			statusText = error.statusText;
		}
	}
	return new Response(JSON.stringify(bodyJson, null, 2), {
		status: status,
		statusText: statusText,
		headers: {
			'Content-Type': 'application/json',
		},
	});
}

class HTTPError extends Error {
	constructor(name, message, status, statusText) {
		super(message);
		this.name = name;
		this.status = status;
		this.statusText = statusText;
	}
}
