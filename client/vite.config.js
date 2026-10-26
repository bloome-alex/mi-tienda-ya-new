import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [vue()],
  define: { __APP_VERSION__: JSON.stringify(rootPackage.version) },
  server: { host: '0.0.0.0', port: Number(process.env.CLIENT_PORT || 5173), allowedHosts: ['terminal.local'], proxy: { '/api': 'http://127.0.0.1:' + (process.env.PORT || 5000), '/uploads': 'http://127.0.0.1:' + (process.env.PORT || 5000) } },
  build: { sourcemap: false, chunkSizeWarningLimit: 800 }
});
