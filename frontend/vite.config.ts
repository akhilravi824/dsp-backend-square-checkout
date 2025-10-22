import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const isProduction = process.env.NODE_ENV === 'production';
const serverUrl = isProduction ? 'https://dsp-api.vercel.app' : 'http://localhost:3000';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5173,
		proxy: {
			'/api': {
				target: serverUrl,
				changeOrigin: true,
				secure: true,
				rewrite: (path) => path,
			},
			'/health': {
				target: serverUrl,
				changeOrigin: true,
				secure: true,
				rewrite: (path) => path
			}
		}
	}
});
