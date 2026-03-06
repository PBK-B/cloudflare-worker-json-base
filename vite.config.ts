import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	base: './',
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
		proxy: {
			'/._jsondb_/api': {
				target: 'http://localhost:8788',
				changeOrigin: true,
				configure: (proxy, options) => {
					proxy.on('proxyReq', (proxyReq, req, res) => {
						if (req.headers.authorization) {
							proxyReq.setHeader('Authorization', req.headers.authorization as string);
						}
					});
				},
			},
		},
	},
	resolve: {
		alias: {
			'@': '/src',
		},
	},
});
