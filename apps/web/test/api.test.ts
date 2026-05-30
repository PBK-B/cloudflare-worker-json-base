import { apiRequest } from '../src/shared/api/client';
import { usePermissionApi } from '../src/features/permissions/api';
import { useResourceApi } from '../src/features/resources/api';

describe('web api client', () => {
	it('adds bearer authorization from stored api key', async () => {
		localStorage.setItem('jsonbase-api-key', 'secret-key');
		global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })) as jest.Mock;

		await apiRequest('/health');

		const [, init] = (global.fetch as jest.Mock).mock.calls[0];
		expect((init.headers as Headers).get('Authorization')).toBe('Bearer secret-key');
	});

	it('normalizes resource list responses for the UI model', async () => {
		global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
			success: true,
			data: {
				items: [{ path: '/docs/readme.txt', type: 'text', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', size: 12, contentType: 'text/plain' }],
				total: 1,
				page: 1,
				limit: 20,
			},
		}), { status: 200 })) as jest.Mock;

		const response = await useResourceApi().listData(1, 20, 'readme', 'updated_at', 'desc');

		expect(response.data?.items[0]).toMatchObject({ id: '/docs/readme.txt', type: 'text', content_type: 'text/plain' });
		expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/._jsondb_/api/admin/resources?page=1&limit=20&search=readme&sort=updatedAt&order=desc');
	});

	it('normalizes permission evaluation responses', async () => {
		global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
			success: true,
			data: {
				path: '/public/logo.svg',
				action: 'read',
				allowed: true,
				access: 'public',
				mode: 'public_read_private_write',
				matchedRule: { id: 'rule-1', pattern: '/public/**', mode: 'public_read_private_write', priority: 100, enabled: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
			},
		}), { status: 200 })) as jest.Mock;

		const response = await usePermissionApi().evaluatePermissionRule({ path: '/public/logo.svg', action: 'read' });

		expect(response.data?.matchedRule?.created_at).toBe('2026-01-01T00:00:00.000Z');
		expect(response.data?.access).toBe('public');
	});

	it('uses runtime route base overrides', async () => {
		window.__JSONBASE_CONFIG__ = { systemApiBasePath: '/system/api', resourceBasePath: '/data' };
		global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })) as jest.Mock;

		await apiRequest('/health');

		expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/system/api/health');
		expect(useResourceApi().getResourceUrl('/docs/readme.txt')).toBe('http://localhost/data/docs/readme.txt');
	});
});
