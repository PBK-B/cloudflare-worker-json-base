/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_API_BASE_URL: string;
	readonly VITE_DASH_PATH: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare module '*.module.scss' {
	const classes: { readonly [key: string]: string };
	export default classes;
}
