import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'jsonbase-theme';

export function useTheme() {
	const [theme, setTheme] = useState<ThemeMode>(() => {
		const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
		return stored === 'dark' ? 'dark' : 'light';
	});

	useEffect(() => {
		document.documentElement.setAttribute('data-theme', theme);
		localStorage.setItem(STORAGE_KEY, theme);
	}, [theme]);

	return {
		theme,
		toggleTheme: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
		setTheme,
	};
}
