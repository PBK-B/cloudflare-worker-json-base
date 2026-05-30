import '@testing-library/jest-dom';
import '../src/i18n';

const localStorageState = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
	value: {
		getItem: jest.fn((key: string) => localStorageState.get(key) ?? null),
		setItem: jest.fn((key: string, value: string) => {
			localStorageState.set(key, value);
		}),
		removeItem: jest.fn((key: string) => {
			localStorageState.delete(key);
		}),
		clear: jest.fn(() => {
			localStorageState.clear();
		}),
	},
	writable: true,
});

class TestHeaders {
	private values = new Map<string, string>();

	constructor(init?: HeadersInit) {
		if (!init) return;
		if (Array.isArray(init)) {
			for (const [key, value] of init) this.set(key, value);
			return;
		}

		if (init instanceof TestHeaders) {
			init.forEach((value, key) => this.set(key, value));
			return;
		}

		Object.entries(init).forEach(([key, value]) => this.set(key, String(value)));
	}

	append(key: string, value: string): void {
		this.set(key, value);
	}

	forEach(callback: (value: string, key: string) => void): void {
		this.values.forEach((value, key) => callback(value, key));
	}

	get(key: string): string | null {
		return this.values.get(key.toLowerCase()) ?? null;
	}

	has(key: string): boolean {
		return this.values.has(key.toLowerCase());
	}

	set(key: string, value: string): void {
		this.values.set(key.toLowerCase(), value);
	}
}

class TestResponse {
	ok: boolean;
	status: number;
	private body: string;

	constructor(body: string, init: ResponseInit = {}) {
		this.body = body;
		this.status = init.status ?? 200;
		this.ok = this.status >= 200 && this.status < 300;
	}

	async json(): Promise<unknown> {
		return JSON.parse(this.body);
	}
}

Object.defineProperty(globalThis, 'Headers', { value: TestHeaders, writable: true });
Object.defineProperty(globalThis, 'Response', { value: TestResponse, writable: true });

Object.defineProperty(globalThis, 'ResizeObserver', {
	value: class ResizeObserver {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	},
	writable: true,
});

beforeEach(() => {
	localStorageState.clear();
	delete window.__JSONBASE_CONFIG__;
	jest.clearAllMocks();
});
