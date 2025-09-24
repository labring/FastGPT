import { vi } from 'vitest';
import './request';

vi.mock('@fastgpt/service/support/audit/util', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    addAuditLog: vi.fn()
  };
});

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

// Mock BullMQ to prevent queue connection errors
vi.mock('@fastgpt/service/common/bullmq', async (importOriginal) => {
  const actual = (await importOriginal()) as any;

  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: '1' }),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn()
  };

  const mockWorker = {
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn()
  };

  return {
    ...actual,
    getQueue: vi.fn(() => mockQueue),
    getWorker: vi.fn(() => mockWorker)
  };
});
