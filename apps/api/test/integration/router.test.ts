import worker from '../../src/index';
import { createMockEnv } from '../helpers/mocks';

const authHeader = { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' };

async function json<T = any>(response: Response): Promise<T> {
	return response.json() as Promise<T>;
}

describe('new api router', () => {
	it('redirects /dash to an absolute /dash/ URL', async () => {
		const env = createMockEnv();
		const response = await worker.fetch(new Request('https://example.com/dash'), env);
		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toBe('https://example.com/dash/');
	});

	it('serves /._jsondb_/api/health', async () => {
		const env = createMockEnv();
		const response = await worker.fetch(new Request('https://example.com/._jsondb_/api/health'), env);
		expect(response.status).toBe(200);
		const payload = await json(response);
		expect(payload.success).toBe(true);
		expect(payload.data.status).toBe('healthy');
	});

	it('stores and lists admin resources', async () => {
		const env = createMockEnv();

		const createResponse = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/my/config', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ value: { theme: 'dark' }, type: 'json', contentType: 'application/json' })
			}),
			env
		);

		expect(createResponse.status).toBe(200);

		const listResponse = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources?page=1&limit=20', {
				headers: { Authorization: 'Bearer test-api-key' }
			}),
			env
		);

		expect(listResponse.status).toBe(200);
		const listPayload = await json(listResponse);
		expect(listPayload.data.items).toHaveLength(1);
		expect(listPayload.data.items[0].path).toBe('/my/config');
	});

	it('supports deployment-configurable system and resource base paths', async () => {
		const env = createMockEnv({ API_BASE_PATH: '/system/api', RESOURCE_BASE_PATH: '/data' });

		const healthResponse = await worker.fetch(new Request('https://example.com/system/api/health'), env);
		expect(healthResponse.status).toBe(200);

		await worker.fetch(
			new Request('https://example.com/system/api/admin/permissions/rules', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ pattern: '/custom/**', mode: 'public_read_private_write', priority: 100 })
			}),
			env
		);

		await worker.fetch(
			new Request('https://example.com/system/api/admin/resources/custom/item', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ value: 'custom-data', type: 'text', contentType: 'text/plain' })
			}),
			env
		);

		const response = await worker.fetch(new Request('https://example.com/data/custom/item'), env);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('custom-data');
	});

	it('creates and evaluates permission rules', async () => {
		const env = createMockEnv();

		const createRuleResponse = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/permissions/rules', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ pattern: '/public/**', mode: 'public_read_private_write', priority: 100 })
			}),
			env
		);

		expect(createRuleResponse.status).toBe(201);

		const evaluateResponse = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/permissions/evaluate', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ path: '/public/logo.svg', action: 'read' })
			}),
			env
		);

		expect(evaluateResponse.status).toBe(200);
		const evaluatePayload = await json(evaluateResponse);
		expect(evaluatePayload.data.allowed).toBe(true);
		expect(evaluatePayload.data.access).toBe('public');
	});

	it('supports public read plus HEAD for binary resources', async () => {
		const env = createMockEnv();

		await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/permissions/rules', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ pattern: '/public/**', mode: 'public_read_private_write', priority: 100 })
			}),
			env
		);

		await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/public/logo.svg', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ value: 'svg-data', type: 'binary', contentType: 'image/svg+xml' })
			}),
			env
		);

		const getResponse = await worker.fetch(new Request('https://example.com/public/logo.svg'), env);
		expect(getResponse.status).toBe(200);
		expect(getResponse.headers.get('Content-Type')).toBe('image/svg+xml');

		const headResponse = await worker.fetch(
			new Request('https://example.com/public/logo.svg', { method: 'HEAD' }),
			env
		);
		expect(headResponse.status).toBe(200);
		expect(headResponse.headers.get('Content-Length')).toBe('8');
	});

	it('filters and sorts admin resources', async () => {
		const env = createMockEnv();

		await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/b/items/large.txt', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ value: '1234567890', type: 'text', contentType: 'text/plain' })
			}),
			env
		);

		await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/a/items/small.txt', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ value: '1', type: 'text', contentType: 'text/plain' })
			}),
			env
		);

		const searchResponse = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources?search=small&sort=path&order=asc', {
				headers: { Authorization: 'Bearer test-api-key' }
			}),
			env
		);
		expect(searchResponse.status).toBe(200);
		const searchPayload = await json(searchResponse);
		expect(searchPayload.data.items).toHaveLength(1);
		expect(searchPayload.data.items[0].path).toBe('/a/items/small.txt');

		const sortedResponse = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources?sort=size&order=desc', {
				headers: { Authorization: 'Bearer test-api-key' }
			}),
			env
		);
		expect(sortedResponse.status).toBe(200);
		const sortedPayload = await json(sortedResponse);
		expect(sortedPayload.data.items[0].path).toBe('/b/items/large.txt');
	});

	it('accepts multipart binary uploads through admin resources', async () => {
		const env = createMockEnv();
		const formData = new FormData();
		formData.append('file', new Blob(['binary-payload'], { type: 'image/png' }), 'photo.png');

		const uploadResponse = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/uploads/photo.png', {
				method: 'POST',
				headers: { Authorization: 'Bearer test-api-key' },
				body: formData
			}),
			env
		);

		expect(uploadResponse.status).toBe(200);

		const getResponse = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/uploads/photo.png', {
				headers: { Authorization: 'Bearer test-api-key' }
			}),
			env
		);

		expect(getResponse.status).toBe(200);
		const payload = await json(getResponse);
		expect(payload.data.path).toBe('/uploads/photo.png');
		expect(payload.data.type).toBe('binary');
		expect(payload.data.contentType).toBe('image/png');
	});

	it('validates health, console info, config, and stats after resource writes', async () => {
		const env = createMockEnv();

		const healthResponse = await worker.fetch(new Request('https://example.com/._jsondb_/api/health?key=test-api-key'), env);
		expect(healthResponse.status).toBe(200);
		expect((await json(healthResponse)).data.apiKey).toEqual({ valid: true, method: 'query' });

		const configResponse = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/console/config', { headers: { Authorization: 'Bearer test-api-key' } }),
			env
		);
		expect(configResponse.status).toBe(200);
		const configPayload = await json(configResponse);
		expect(configPayload.data.apiBasePath).toBe('/._jsondb_/api');
		expect(configPayload.data.webBasePath).toBe('/dash');

		const consoleResponse = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/console', { headers: { Authorization: 'Bearer test-api-key' } }),
			env
		);
		expect(consoleResponse.status).toBe(200);
		const consolePayload = await json(consoleResponse);
		expect(consolePayload.data.endpoints.health).toBe('/._jsondb_/api/health');

		await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/stats/a.json', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ value: { ok: true }, type: 'json', contentType: 'application/json' })
			}),
			env
		);
		await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/stats/b.txt', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ value: 'hello', type: 'text', contentType: 'text/plain' })
			}),
			env
		);

		const statsResponse = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/console/stats', { headers: { Authorization: 'Bearer test-api-key' } }),
			env
		);
		expect(statsResponse.status).toBe(200);
		const statsPayload = await json(statsResponse);
		expect(statsPayload.data.totalCount).toBe(2);
		expect(statsPayload.data.totalSize).toBeGreaterThan(0);
	});

	it('runs a full admin resource CRUD chain for json and text resources', async () => {
		const env = createMockEnv();

		const createJson = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/crud/config.json', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ value: { theme: 'light' }, type: 'json', contentType: 'application/json' })
			}),
			env
		);
		expect(createJson.status).toBe(200);

		const getJson = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/crud/config.json', { headers: { Authorization: 'Bearer test-api-key' } }),
			env
		);
		expect((await json(getJson)).data.value).toEqual({ theme: 'light' });

		const updateJson = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/crud/config.json', {
				method: 'PUT',
				headers: authHeader,
				body: JSON.stringify({ value: { theme: 'dark' }, type: 'json', contentType: 'application/json' })
			}),
			env
		);
		expect((await json(updateJson)).data.value).toEqual({ theme: 'dark' });

		const createText = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/crud/readme.txt', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ value: 'searchable text', type: 'text', contentType: 'text/plain' })
			}),
			env
		);
		expect(createText.status).toBe(200);

		const searchText = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources?search=searchable', { headers: { Authorization: 'Bearer test-api-key' } }),
			env
		);
		expect((await json(searchText)).data.items.map((item: any) => item.path)).toContain('/crud/readme.txt');

		const deleteJson = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/crud/config.json', {
				method: 'DELETE',
				headers: { Authorization: 'Bearer test-api-key' }
			}),
			env
		);
		expect(deleteJson.status).toBe(204);

		const getDeleted = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/crud/config.json', { headers: { Authorization: 'Bearer test-api-key' } }),
			env
		);
		expect(getDeleted.status).toBe(404);
	});

	it('runs public root resource CRUD gated by permission rules', async () => {
		const env = createMockEnv();

		let publicWrite = await worker.fetch(
			new Request('https://example.com/public/notes.txt', {
				method: 'POST',
				headers: { 'Content-Type': 'text/plain' },
				body: 'unauthorized'
			}),
			env
		);
		expect(publicWrite.status).toBe(401);

		await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/permissions/rules', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ pattern: '/public/**', mode: 'public_rw', priority: 100 })
			}),
			env
		);

		publicWrite = await worker.fetch(
			new Request('https://example.com/public/notes.txt', {
				method: 'POST',
				headers: { 'Content-Type': 'text/plain' },
				body: 'hello public'
			}),
			env
		);
		expect(publicWrite.status).toBe(200);
		expect(await publicWrite.text()).toBe('hello public');

		const publicUpdate = await worker.fetch(
			new Request('https://example.com/public/notes.txt', {
				method: 'PUT',
				headers: { 'Content-Type': 'text/plain' },
				body: 'updated public'
			}),
			env
		);
		expect(publicUpdate.status).toBe(200);
		expect(await publicUpdate.text()).toBe('updated public');

		const publicRead = await worker.fetch(new Request('https://example.com/public/notes.txt'), env);
		expect(publicRead.status).toBe(200);
		expect(await publicRead.text()).toBe('updated public');

		const publicDelete = await worker.fetch(new Request('https://example.com/public/notes.txt', { method: 'DELETE' }), env);
		expect(publicDelete.status).toBe(204);
	});

	it('runs end-to-end public JSON, text, and binary resource flows', async () => {
		const env = createMockEnv();

		const ruleResponse = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/permissions/rules', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ pattern: '/e2e/**', mode: 'public_rw', priority: 100 })
			}),
			env
		);
		expect(ruleResponse.status).toBe(201);

		const createJson = await worker.fetch(
			new Request('https://example.com/e2e/config.json', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: true, nested: { version: 1 } })
			}),
			env
		);
		expect(createJson.status).toBe(200);
		expect(createJson.headers.get('Content-Type')).toBe('application/json');
		expect(await createJson.json()).toEqual({ enabled: true, nested: { version: 1 } });

		const updateJson = await worker.fetch(
			new Request('https://example.com/e2e/config.json', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: false, nested: { version: 2 } })
			}),
			env
		);
		expect(updateJson.status).toBe(200);
		expect(await updateJson.json()).toEqual({ enabled: false, nested: { version: 2 } });

		const readJson = await worker.fetch(new Request('https://example.com/e2e/config.json'), env);
		expect(readJson.status).toBe(200);
		expect(readJson.headers.get('Content-Length')).toBe('40');
		expect(await readJson.json()).toEqual({ enabled: false, nested: { version: 2 } });

		const headJson = await worker.fetch(new Request('https://example.com/e2e/config.json', { method: 'HEAD' }), env);
		expect(headJson.status).toBe(200);
		expect(headJson.headers.get('Content-Type')).toBe('application/json');
		expect(headJson.headers.get('Content-Length')).toBe('40');
		expect(await headJson.text()).toBe('');

		const createText = await worker.fetch(
			new Request('https://example.com/e2e/readme.txt', {
				method: 'POST',
				headers: { 'Content-Type': 'text/plain' },
				body: 'hello public text'
			}),
			env
		);
		expect(createText.status).toBe(200);
		expect(createText.headers.get('Content-Type')).toBe('text/plain');
		expect(await createText.text()).toBe('hello public text');

		const updateText = await worker.fetch(
			new Request('https://example.com/e2e/readme.txt', {
				method: 'PUT',
				headers: { 'Content-Type': 'text/plain' },
				body: 'updated public text'
			}),
			env
		);
		expect(updateText.status).toBe(200);
		expect(await updateText.text()).toBe('updated public text');

		const readText = await worker.fetch(new Request('https://example.com/e2e/readme.txt'), env);
		expect(readText.status).toBe(200);
		expect(readText.headers.get('Content-Length')).toBe('19');
		expect(await readText.text()).toBe('updated public text');

		const headText = await worker.fetch(new Request('https://example.com/e2e/readme.txt', { method: 'HEAD' }), env);
		expect(headText.status).toBe(200);
		expect(headText.headers.get('Content-Type')).toBe('text/plain');
		expect(headText.headers.get('Content-Length')).toBe('19');
		expect(await headText.text()).toBe('');

		const firstBinaryUpload = new FormData();
		firstBinaryUpload.append('file', new Blob(['binary-one'], { type: 'application/octet-stream' }), 'file.bin');
		const createBinary = await worker.fetch(
			new Request('https://example.com/e2e/file.bin', {
				method: 'POST',
				body: firstBinaryUpload
			}),
			env
		);
		expect(createBinary.status).toBe(200);
		expect(createBinary.headers.get('Content-Type')).toBe('application/octet-stream');
		expect(await createBinary.text()).toBe('binary-one');

		const secondBinaryUpload = new FormData();
		secondBinaryUpload.append('file', new Blob(['binary-two!!'], { type: 'application/octet-stream' }), 'file.bin');
		const updateBinary = await worker.fetch(
			new Request('https://example.com/e2e/file.bin', {
				method: 'PUT',
				body: secondBinaryUpload
			}),
			env
		);
		expect(updateBinary.status).toBe(200);
		expect(await updateBinary.text()).toBe('binary-two!!');

		const readBinary = await worker.fetch(new Request('https://example.com/e2e/file.bin'), env);
		expect(readBinary.status).toBe(200);
		expect(readBinary.headers.get('Content-Length')).toBe('12');
		expect(await readBinary.text()).toBe('binary-two!!');

		const headBinary = await worker.fetch(new Request('https://example.com/e2e/file.bin', { method: 'HEAD' }), env);
		expect(headBinary.status).toBe(200);
		expect(headBinary.headers.get('Content-Type')).toBe('application/octet-stream');
		expect(headBinary.headers.get('Content-Length')).toBe('12');
		expect(await headBinary.text()).toBe('');

		for (const path of ['config.json', 'readme.txt', 'file.bin']) {
			const deleteResponse = await worker.fetch(new Request(`https://example.com/e2e/${path}`, { method: 'DELETE' }), env);
			expect(deleteResponse.status).toBe(204);

			const readDeleted = await worker.fetch(new Request(`https://example.com/e2e/${path}`), env);
			expect(readDeleted.status).toBe(404);
		}
	});

	it('runs permission rule lifecycle and observes resource access changes', async () => {
		const env = createMockEnv();

		await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/secure/doc.txt', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ value: 'classified', type: 'text', contentType: 'text/plain' })
			}),
			env
		);

		const createRule = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/permissions/rules', {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({ pattern: '/secure/**', mode: 'public_read_private_write', priority: 50, description: 'secure read' })
			}),
			env
		);
		const rule = (await json(createRule)).data;

		let publicRead = await worker.fetch(new Request('https://example.com/secure/doc.txt'), env);
		expect(publicRead.status).toBe(200);
		expect(await publicRead.text()).toBe('classified');

		const updateRule = await worker.fetch(
			new Request(`https://example.com/._jsondb_/api/admin/permissions/rules/${rule.id}`, {
				method: 'PUT',
				headers: authHeader,
				body: JSON.stringify({ pattern: '/secure/**', mode: 'private_rw', priority: 60, description: 'secure private' })
			}),
			env
		);
		expect((await json(updateRule)).data.mode).toBe('private_rw');

		publicRead = await worker.fetch(new Request('https://example.com/secure/doc.txt'), env);
		expect(publicRead.status).toBe(401);

		const authedRead = await worker.fetch(new Request('https://example.com/secure/doc.txt?key=test-api-key'), env);
		expect(authedRead.status).toBe(200);
		expect(await authedRead.text()).toBe('classified');

		const disableRule = await worker.fetch(
			new Request(`https://example.com/._jsondb_/api/admin/permissions/rules/${rule.id}/status`, {
				method: 'PATCH',
				headers: authHeader,
				body: JSON.stringify({ enabled: false })
			}),
			env
		);
		expect((await json(disableRule)).data.enabled).toBe(false);

		const filteredRules = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/permissions/rules?enabled=false&search=secure', {
				headers: { Authorization: 'Bearer test-api-key' }
			}),
			env
		);
		expect((await json(filteredRules)).data.items).toHaveLength(1);

		const deleteRule = await worker.fetch(
			new Request(`https://example.com/._jsondb_/api/admin/permissions/rules/${rule.id}`, {
				method: 'DELETE',
				headers: { Authorization: 'Bearer test-api-key' }
			}),
			env
		);
		expect(deleteRule.status).toBe(204);
	});

	it('supports binary replace and query-key public download through root resources', async () => {
		const env = createMockEnv();
		const firstUpload = new FormData();
		firstUpload.append('file', new Blob(['first-bytes'], { type: 'application/octet-stream' }), 'blob.bin');

		const createResponse = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/private/blob.bin', {
				method: 'POST',
				headers: { Authorization: 'Bearer test-api-key' },
				body: firstUpload
			}),
			env
		);
		expect(createResponse.status).toBe(200);

		const secondUpload = new FormData();
		secondUpload.append('file', new Blob(['second-bytes'], { type: 'application/octet-stream' }), 'blob.bin');
		const replaceResponse = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources/private/blob.bin', {
				method: 'PUT',
				headers: { Authorization: 'Bearer test-api-key' },
				body: secondUpload
			}),
			env
		);
		expect(replaceResponse.status).toBe(200);

		const deniedDownload = await worker.fetch(new Request('https://example.com/private/blob.bin'), env);
		expect(deniedDownload.status).toBe(401);

		const download = await worker.fetch(new Request('https://example.com/private/blob.bin?key=test-api-key'), env);
		expect(download.status).toBe(200);
		expect(download.headers.get('Content-Length')).toBe('12');
		expect(await download.text()).toBe('second-bytes');
	});

	it('handles CORS preflight and authentication errors consistently', async () => {
		const env = createMockEnv();

		const preflight = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources', {
				method: 'OPTIONS',
				headers: { Origin: 'https://app.example' }
			}),
			env
		);
		expect(preflight.status).toBe(204);
		expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');

		const missingAuth = await worker.fetch(new Request('https://example.com/._jsondb_/api/admin/resources'), env);
		expect(missingAuth.status).toBe(401);

		const invalidAuth = await worker.fetch(
			new Request('https://example.com/._jsondb_/api/admin/resources', { headers: { Authorization: 'Bearer nope' } }),
			env
		);
		expect(invalidAuth.status).toBe(403);

		const invalidSystemRoute = await worker.fetch(new Request('https://example.com/._jsondb_/api/nope'), env);
		expect(invalidSystemRoute.status).toBe(404);
	});
});
