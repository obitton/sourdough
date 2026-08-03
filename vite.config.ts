import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // These are simulation tests, not unit tests: a single case folds tens of
    // thousands of events through the validator, and several files compete for
    // CPU in parallel. The 5s default fails on contention, not on correctness.
    testTimeout: 60_000,
  },
});
