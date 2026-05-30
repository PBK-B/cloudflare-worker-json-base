/// <reference types="vite/client" />

declare module '*.module.css' {
	const classes: Record<string, string>;
	export default classes;
}

declare module '*.module.scss' {
	const classes: Record<string, string>;
	export default classes;
}

interface Window {
	__JSONBASE_CONFIG__?: {
		systemApiBasePath?: string;
		resourceBasePath?: string;
	};
}
