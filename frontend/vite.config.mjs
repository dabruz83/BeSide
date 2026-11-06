import { defineConfig, loadEnv, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const publicEnv = Object.fromEntries(Object.entries(env).filter(([name]) => name.startsWith('REACT_APP_')));
  return {
    plugins: [
      { name: 'legacy-jsx-extension', enforce: 'pre', async transform(code, id) {
        if (/\/src\/.*\.js$/.test(id)) return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' });
      } },
      react(),
    ],
    resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
    define: { 'process.env': JSON.stringify(publicEnv) },
    build: { outDir: 'build' },
    server: { host: '127.0.0.1', port: 3100, strictPort: true,
      proxy: { '/api': { target: env.BACKEND_PROXY_URL || 'http://127.0.0.1:8100', changeOrigin: false } } },
    optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } },
  };
});
