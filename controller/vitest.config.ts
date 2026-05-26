import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// A few modules under src/ create dirs / read settings at import time
// (notably observability/events.ts → mkdir($STATE_DIR/logs)). Point STATE_DIR
// at a per-run tmp path so test-time imports never touch the real state/
// directory. Tests that exercise file IPC (queue, session, settings.update)
// should still scope their own subdirs via STATE_DIR in beforeEach if they
// need isolation between tests.
const TEST_STATE_DIR = join(tmpdir(), 'subwave-test-state');

export default defineConfig({
  test: {
    root: '.',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    clearMocks: true,
    env: {
      STATE_DIR: TEST_STATE_DIR,
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});
