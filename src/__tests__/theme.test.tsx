import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

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

describe('Dark Mode Theme', () => {
	beforeEach(() => {
		(localStorageMock.getItem as jest.Mock).mockReturnValue(null);
		localStorageMock.setItem.mockClear();
		document.body.className = '';
		document.documentElement.removeAttribute('data-theme');
		document.body.classList.remove('rs-theme-light', 'rs-theme-dark');
	});

	test('should have light theme by default', () => {
		render(<App />);
		expect(document.body.classList.contains('rs-theme-light')).toBe(true);
		expect(document.body.classList.contains('rs-theme-dark')).toBe(false);
	});

	test('should apply dark theme class when toggle is clicked', async () => {
		render(<App />);

		const toggleButton = document.querySelector('.header-actions button');

		await act(async () => {
			fireEvent.click(toggleButton as Element);
		});

		expect(document.body.classList.contains('rs-theme-dark')).toBe(true);
		expect(document.body.classList.contains('rs-theme-light')).toBe(false);
		expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'dark');
	});

	test('should toggle back to light theme', async () => {
		render(<App />);

		const toggleButton = document.querySelector('.header-actions button');

		await act(async () => {
			fireEvent.click(toggleButton as Element);
		});

		expect(document.body.classList.contains('rs-theme-dark')).toBe(true);

		await act(async () => {
			fireEvent.click(toggleButton as Element);
		});

		expect(document.body.classList.contains('rs-theme-light')).toBe(true);
		expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'light');
	});

	test('should persist theme in localStorage', async () => {
		(localStorageMock.getItem as jest.Mock).mockReturnValue('dark');

		const { unmount } = render(<App />);

		await waitFor(() => {
			expect(document.body.classList.contains('rs-theme-dark')).toBe(true);
		});

		unmount();
	});

	test('should have data-theme attribute set', async () => {
		render(<App />);

		expect(document.documentElement.getAttribute('data-theme')).toBe('light');

		const toggleButton = document.querySelector('.header-actions button');

		await act(async () => {
			fireEvent.click(toggleButton as Element);
		});

		expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
	});

	test('should have consistent colors between header and content in dark mode', async () => {
		render(<App />);

		const toggleButton = document.querySelector('.header-actions button');

		await act(async () => {
			fireEvent.click(toggleButton as Element);
		});

		const header = document.querySelector('.app-header');
		const mainContent = document.querySelector('.main-content');

		const headerStyles = window.getComputedStyle(header as Element);
		const contentStyles = window.getComputedStyle(mainContent as Element);

		expect(headerStyles.backgroundColor).toBe(contentStyles.backgroundColor);
		expect(headerStyles.borderBottomColor).toBeTruthy();
	});
});
