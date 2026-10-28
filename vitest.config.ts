import { defineConfig } from 'vitest/config';
import { alias } from './vite.config.ts';

export default defineConfig({
  resolve: { alias },
  define: { __GAME_BUILD__: JSON.stringify('test') },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
