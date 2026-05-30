import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../src/features/auth/AuthProvider';

const AuthProbe: React.FC = () => {
	const { isAuthenticated, isLoading, login } = useAuth();

	return (
		<div>
			<div data-testid="loading">{String(isLoading)}</div>
			<div data-testid="authenticated">{String(isAuthenticated)}</div>
			<button onClick={() => void login('wrong-key')}>Login</button>
		</div>
	);
};

describe('AuthProvider', () => {
	it('rejects health responses that do not validate the api key', async () => {
		global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
			success: true,
			data: { apiKey: { valid: false } },
			timestamp: '2026-01-01T00:00:00.000Z',
		}), { status: 200 })) as jest.Mock;

		render(
			<AuthProvider>
				<AuthProbe />
			</AuthProvider>
		);

		await screen.findByText('Login');
		screen.getByText('Login').click();

		await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('false'));
		expect(localStorage.getItem('jsonbase-api-key')).toBeNull();
		expect(localStorage.getItem('jsonbase-verified')).toBeNull();
	});

	it('revalidates a saved key before restoring authentication', async () => {
		localStorage.setItem('jsonbase-api-key', 'stale-key');
		localStorage.setItem('jsonbase-verified', 'true');
		global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
			success: true,
			data: { apiKey: { valid: false } },
			timestamp: '2026-01-01T00:00:00.000Z',
		}), { status: 200 })) as jest.Mock;

		render(
			<AuthProvider>
				<AuthProbe />
			</AuthProvider>
		);

		await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
		expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
		expect(localStorage.getItem('jsonbase-api-key')).toBeNull();
		expect(localStorage.getItem('jsonbase-verified')).toBeNull();
	});
});
