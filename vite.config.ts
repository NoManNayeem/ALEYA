import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export const alias = {
  '@aleya/game-core': r('./packages/game-core/src/index.ts'),
  '@aleya/renderer-pc': r('./packages/renderer-pc/src/index.ts'),
  '@aleya/audio': r('./packages/audio/src/index.ts'),
  '@aleya/ui': r('./packages/ui/src/index.ts'),
  '@aleya/content-schema': r('./packages/content-schema/src/index.ts'),
  '@content': r('./content'),
};

export default defineConfig({
  root: r('./apps/web'),
  base: './',
  publicDir: r('./apps/web/public'),
  resolve: { alias },
  define: {
    __GAME_BUILD__: JSON.stringify(process.env.GAME_BUILD ?? `0.1.0-${new Date().toISOString().slice(0, 10)}`),
  },
  server: { port: 5173, fs: { allow: [r('.')] } },
  preview: { port: 4173 },
  build: {
    outDir: r('./dist'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/playcanvas') ? 'engine' : undefined),
      },
    },
  },
});
