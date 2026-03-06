import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const workerTarget = 'http://localhost:8788';
const resourceProxyPattern = '^/(?!dash(?:/|$)|\._jsondb_/api(?:/|$)|@vite/|@fs/|src/|node_modules/).*';

export default defineConfig({
	plugins: [react()],
	base: '/dash',
	build: {
		outDir: 'dist-webui/dash',
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (!id.includes('node_modules')) {
						return undefined;
					}

					if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router-dom/')) {
						return 'vendor-ui';
					}

					if (id.includes('/rsuite/')) {
						return 'vendor-ui';
					}

					if (id.includes('/i18next/') || id.includes('/react-i18next/')) {
						return 'vendor-i18n';
					}

					if (id.includes('/lucide-react/')) {
						return 'vendor-icons';
					}

					if (id.includes('/axios/')) {
						return 'vendor-axios';
					}

					return undefined;
				},
				entryFileNames: 'assets/[name].js',
				chunkFileNames: 'assets/[name].js',
				assetFileNames: 'assets/[name].[ext]',
			},
		},
	},
	server: {
		port: 3000,
		open: '/dash',
		proxy: {
			'/._jsondb_/api': {
				target: workerTarget,
				changeOrigin: true,
				configure: (proxy) => {
					proxy.on('proxyReq', (proxyReq, req) => {
						if (req.headers.authorization) {
							proxyReq.setHeader('Authorization', req.headers.authorization as string);
						}
					});
				},
			},
			[resourceProxyPattern]: {
				target: workerTarget,
				changeOrigin: true,
			},
		},
	},
	resolve: {
		alias: {
			'@': '/src',
		},
	},
});
