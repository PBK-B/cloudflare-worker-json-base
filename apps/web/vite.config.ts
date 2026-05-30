import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [react()],
	base: '/dash',
	build: {
		outDir: '../../dist/web/dash',
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes('/node_modules/rsuite/')) {
						return 'rsuite';
					}

					if (id.includes('/node_modules/')) {
						return 'vendor';
					}
				}
			}
		}
	},
	server: {
		port: 3000,
		open: '/dash',
		proxy: {
			'/._jsondb_/api': {
				target: 'http://localhost:8788',
				changeOrigin: true
			},
			'^/(?!dash(?:/|$)|\\._jsondb_/api(?:/|$)).*': {
				target: 'http://localhost:8788',
				changeOrigin: true
			}
		}
	}
});
