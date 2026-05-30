import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../src/pages/LoginPage';
import AdminDataPage from '../src/pages/admin/AdminDataPage';
import AdminPermissionsPage from '../src/pages/admin/AdminPermissionsPage';

const navigate = jest.fn();
const outletContext = {
	onOpenCreateModal: jest.fn(),
	onOpenEditModal: jest.fn(),
	refreshKey: 0,
};
const login = jest.fn();
const listData = jest.fn();
const deleteData = jest.fn();
const getResourceUrl = jest.fn((path: string) => path);
const listPermissionRules = jest.fn();
const createPermissionRule = jest.fn();
const updatePermissionRule = jest.fn();
const setPermissionRuleStatus = jest.fn();
const deletePermissionRule = jest.fn();
const evaluatePermissionRule = jest.fn();

jest.mock('react-router-dom', () => ({
	Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
	useNavigate: () => navigate,
	useOutletContext: () => outletContext,
}));

jest.mock('../src/features/auth/AuthProvider', () => ({
	useAuth: () => ({
		login,
		isAuthenticated: false,
		isLoading: false,
	}),
}));

jest.mock('../src/features/resources/api', () => ({
	useResourceApi: () => ({
		listData,
		deleteData,
		getResourceUrl,
	}),
}));

jest.mock('../src/features/permissions/api', () => ({
	usePermissionApi: () => ({
		listPermissionRules,
		createPermissionRule,
		updatePermissionRule,
		setPermissionRuleStatus,
		deletePermissionRule,
		evaluatePermissionRule,
	}),
}));

jest.mock('../src/utils/notification', () => ({
	notify: {
		success: jest.fn(),
		error: jest.fn(),
		warning: jest.fn(),
		info: jest.fn(),
	},
}));

describe('web page interactions', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		login.mockResolvedValue({ success: true });
		listData.mockResolvedValue({
			success: true,
			data: {
				items: [{ id: '/docs/readme.txt', path: '/docs/readme.txt', type: 'text', size: 12, updated_at: '2026-01-02T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' }],
				total: 1,
			},
		});
		deleteData.mockResolvedValue({ success: true });
		listPermissionRules.mockResolvedValue({
			success: true,
			data: { items: [{ id: 'rule-1', pattern: '/public/**', mode: 'public_read_private_write', priority: 100, enabled: true, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }] },
		});
		evaluatePermissionRule.mockResolvedValue({
			success: true,
			data: { path: '/public/logo.svg', action: 'read', allowed: true, access: 'public', mode: 'public_read_private_write', matchedRule: { id: 'rule-1', pattern: '/public/**', mode: 'public_read_private_write', priority: 100, enabled: true, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' } },
		});
	});

	it('logs in with an API key', async () => {
		const user = userEvent.setup();
		render(<LoginPage />);

		await user.type(screen.getByPlaceholderText(/API Key/i), 'test-api-key');
		await user.click(screen.getByRole('button', { name: /Validate and Login|验证并登录/ }));

		await waitFor(() => expect(login).toHaveBeenCalledWith('test-api-key'));
		expect(navigate).toHaveBeenCalledWith('/admin');
	});

	it('does not enter admin console when API key validation fails', async () => {
		const user = userEvent.setup();
		login.mockResolvedValue({ success: false, error: 'Invalid API Key' });
		render(<LoginPage />);

		await user.type(screen.getByPlaceholderText(/API Key/i), 'wrong-key');
		await user.click(screen.getByRole('button', { name: /Validate and Login|验证并登录/ }));

		await waitFor(() => expect(login).toHaveBeenCalledWith('wrong-key'));
		expect(navigate).not.toHaveBeenCalled();
		expect(await screen.findByText('Invalid API Key')).toBeInTheDocument();
	});

	it('loads resources and confirms deletion', async () => {
		const user = userEvent.setup();
		render(<AdminDataPage />);

		expect(await screen.findByText('/docs/readme.txt')).toBeInTheDocument();
		const deleteButton = Array.from(document.querySelectorAll('button.rs-btn-red'))[0] as HTMLButtonElement;
		await user.click(deleteButton);
		await user.click(screen.getByRole('button', { name: /Delete|删除/ }));

		await waitFor(() => expect(deleteData).toHaveBeenCalledWith('/docs/readme.txt'));
	});

	it('does not retry resource list endlessly after a load error', async () => {
		listData.mockRejectedValueOnce(new Error('API request failed with status 401'));

		render(<AdminDataPage />);

		expect(await screen.findByText('API request failed with status 401')).toBeInTheDocument();
		await waitFor(() => expect(listData).toHaveBeenCalledTimes(1));
	});

	it('evaluates permission rules from the tester', async () => {
		const user = userEvent.setup();
		render(<AdminPermissionsPage />);

		expect(await screen.findByText('/public/**')).toBeInTheDocument();
		await user.type(screen.getByPlaceholderText('/public/images/logo.png'), '/public/logo.svg');
		await user.click(screen.getByRole('button', { name: /Run Test|开始测试/ }));

		await waitFor(() => expect(evaluatePermissionRule).toHaveBeenCalledWith({ path: '/public/logo.svg', action: 'read' }));
		expect(await screen.findByText(/公开访问|This action is public/i)).toBeInTheDocument();
	});

	it('does not retry permission list endlessly after a load error', async () => {
		listPermissionRules.mockRejectedValueOnce(new Error('API request failed with status 401'));

		render(<AdminPermissionsPage />);

		expect(await screen.findByText('API request failed with status 401')).toBeInTheDocument();
		await waitFor(() => expect(listPermissionRules).toHaveBeenCalledTimes(1));
	});
});
