/**
 * Frontend development server and production bundler configuration. Local
 * API/Swagger traffic is proxied to the Node server; metadata origin replacement
 * here applies only in development, with production replacement handled by Node.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react(), {
    name: 'devtrack-local-metadata', apply: 'serve',
    transformIndexHtml: (html) => html.replaceAll('__DEVTRACK_ORIGIN__', `http://localhost:${process.env.DEV_PORT || '4173'}`),
  }],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.DEV_PORT || '4173'),
    strictPort: true,
    allowedHosts: ['terminal.local'],
    proxy: {
      '/api-docs': {
        target: `http://127.0.0.1:${process.env.API_PORT || '3000'}`,
        changeOrigin: true,
      },
      '/api': { target: `http://127.0.0.1:${process.env.API_PORT || '3000'}`, changeOrigin: true },
      '/swagger': {
        target: `http://127.0.0.1:${process.env.API_PORT || '3000'}`,
        changeOrigin: true,
      },
    },
  },
  build: { sourcemap: false },
});
