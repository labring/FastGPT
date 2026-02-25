import { beforeAll, afterAll, vi } from 'vitest';
import { loadEnvFiles } from './utils/env';

// Set test environment
process.env.NODE_ENV = 'test';

// Load environment variables from .env.test.local if exists
loadEnvFiles({ envFileNames: ['.env.test.local'] });

beforeAll(() => {
  // Additional setup if needed
});

afterAll(() => {
  vi.restoreAllMocks();
});
