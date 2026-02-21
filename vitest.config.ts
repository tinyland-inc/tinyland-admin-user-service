import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'tinyland-admin-user-service',
    globals: true,
    environment: 'node',
  },
});
