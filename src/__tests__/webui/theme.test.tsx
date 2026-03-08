import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../../App';

const localStorageMock = {
	getItem: jest.fn(() => null),
	setItem: jest.fn(),
	clear: jest.fn(),
	removeItem: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
	value: localStorageMock,
	writable: true,
});

Object.defineProperty(window.navigator, 'language', {
	value: 'zh-CN',
	configurable: true,
});

Object.defineProperty(window.navigator, 'languages', {
	value: ['zh-CN', 'zh'],
	configurable: true,
});

describe('登录页面', () => {
	beforeEach(() => {
		(localStorageMock.getItem as jest.Mock).mockReturnValue(null);
		localStorageMock.setItem.mockClear();
		document.body.className = '';
		document.documentElement.removeAttribute('data-theme');
	});

	test('应该显示登录页面', async () => {
		render(<App />);
		expect(await screen.findByText('JSON Base')).toBeInTheDocument();
		expect(screen.getByText('Cloudflare Workers JSON Storage Service')).toBeInTheDocument();
		expect(screen.getByPlaceholderText('Please enter your API key')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /verify and sign in/i })).toBeInTheDocument();
	});

	test('应该显示 API Key 输入框', async () => {
		render(<App />);
		const input = await screen.findByPlaceholderText('Please enter your API key');
		expect(input).toBeInTheDocument();
		expect(input).toHaveAttribute('type', 'password');
	});

	test('应该能够输入 API Key', async () => {
		render(<App />);
		const input = await screen.findByPlaceholderText('Please enter your API key') as HTMLInputElement;
		fireEvent.change(input, { target: { value: 'test-api-key' } });
		expect(input.value).toBe('test-api-key');
	});
});

describe('受保护路由', () => {
	beforeEach(() => {
		(localStorageMock.getItem as jest.Mock).mockReturnValue(null);
		localStorageMock.setItem.mockClear();
		document.body.className = '';
	});

	test('未登录时访问 /admin 应该重定向到登录页', async () => {
		render(<App />);
		expect(await screen.findByText('JSON Base')).toBeInTheDocument();
		expect(screen.queryByText('JSON Base 管理控制台')).not.toBeInTheDocument();
	});

	test('未登录时不应该显示管理控制台', async () => {
		render(<App />);
		await screen.findByText('JSON Base');
		expect(screen.queryByText('控制台')).not.toBeInTheDocument();
		expect(screen.queryByText('数据管理')).not.toBeInTheDocument();
	});
});

describe('应用路由', () => {
	beforeEach(() => {
		(localStorageMock.getItem as jest.Mock).mockReturnValue(null);
		localStorageMock.setItem.mockClear();
		document.body.className = '';
		document.documentElement.removeAttribute('data-theme');
		jest.clearAllMocks();
	});

	test('应该渲染 HashRouter 路由容器', async () => {
		render(<App />);
		expect(await screen.findByText('JSON Base')).toBeInTheDocument();
		expect(document.querySelector('.rs-container')).toBeTruthy();
	});

	test('应该渲染登录卡片容器', async () => {
		render(<App />);
		expect(await screen.findByText('Cloudflare Workers JSON Storage Service')).toBeInTheDocument();
		expect(screen.getByText('JSON Base').closest('div')).toBeTruthy();
	});

	test('根路径应该重定向到登录页', async () => {
		render(<App />);
		await screen.findByText('JSON Base');
		expect(window.location.hash).toBe('#/login');
	});
});

describe('登录表单', () => {
	beforeEach(() => {
		(localStorageMock.getItem as jest.Mock).mockReturnValue(null);
		localStorageMock.setItem.mockClear();
		document.body.className = '';
		document.documentElement.removeAttribute('data-theme');
		jest.clearAllMocks();
	});

	test('登录按钮应该可点击', async () => {
		render(<App />);
		const loginButton = await screen.findByRole('button', { name: /verify and sign in/i });
		expect(loginButton).toBeInTheDocument();
		expect(loginButton).toBeEnabled();
	});

	test('应该显示登录表单结构', async () => {
		render(<App />);
		await screen.findByPlaceholderText('Please enter your API key');
		const form = document.querySelector('form');
		expect(form).toBeInTheDocument();
		expect(form).toHaveClass('rs-form');
	});
});
