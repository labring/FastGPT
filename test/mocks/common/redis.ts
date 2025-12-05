import { vi } from 'vitest';

// Mock Redis connections to prevent connection errors in tests
vi.mock('@fastgpt/service/common/redis', async (importOriginal) => {
  const actual = (await importOriginal()) as any;

  // Create a mock Redis client
  const mockRedisClient = {
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(-1)
  };

  return {
    ...actual,
    newQueueRedisConnection: vi.fn(() => mockRedisClient),
    newWorkerRedisConnection: vi.fn(() => mockRedisClient),
    getGlobalRedisConnection: vi.fn(() => mockRedisClient)
  };
});
