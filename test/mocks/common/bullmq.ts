import { vi } from 'vitest';

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
