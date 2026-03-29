import { defineConfig } from 'vite';

export default defineConfig(() => {
  const base = process.env.BASE_PATH || '/';

  return {
    base,
    server: {
      port: 3000,
      open: true,
    },
    build: {
      target: 'ES2020',
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
