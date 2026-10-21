import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: { host: '0.0.0.0', port: Number(process.env.CLIENT_PORT || 5173), allowedHosts: ['terminal.local'], proxy: { '/api': 'http://127.0.0.1:' + (process.env.PORT || 5000), '/uploads': 'http://127.0.0.1:' + (process.env.PORT || 5000) } },
  build: { sourcemap: false, chunkSizeWarningLimit: 800 }
});
