import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import jsconfigPaths from 'vite-jsconfig-paths';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.BACKEND_PROXY_TARGET || 'http://localhost:8080';
  const proxy = Object.fromEntries(['/api', '/oauth2', '/login/oauth2'].map((p) => [p, { target, changeOrigin: false }]));
  return {
    plugins: [react(), jsconfigPaths()],
    server: { port: 3000, strictPort: true, host: 'localhost', proxy },
    preview: { port: 3000, strictPort: true, host: 'localhost', proxy },
    build: { sourcemap: false, chunkSizeWarningLimit: 1000 }
  };
});
