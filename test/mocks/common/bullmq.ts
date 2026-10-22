import { vi } from 'vitest';

// 直接 mock 定义模块，让直接导入和旧聚合入口共享同一套队列替身。
vi.mock('@fastgpt/dal/redis/bullmq/binding', async (importOriginal) => {
  const actual = (await importOriginal()) as any;

  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: '1' }),
    addBulk: vi.fn().mockResolvedValue([]),
    removeGlobalConcurrency: vi.fn().mockResolvedValue(undefined),
    client: Promise.resolve({ eval: vi.fn().mockResolvedValue(0) }),
    toKey: vi.fn((key: string) => key),
    getJob: vi.fn().mockResolvedValue(undefined),
    getDeduplicationJobId: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn()
  };

  const mockWorker = {
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn()
  };

  // MQ service 单例在模块加载时已经捕获 bullMQ，必须 mock 原对象而不是替换导出引用。
  vi.spyOn(actual.bullMQ, 'getQueue').mockReturnValue(mockQueue);
  vi.spyOn(actual.bullMQ, 'getWorker').mockReturnValue(mockWorker);
  vi.spyOn(actual.bullMQ, 'getLogger').mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  });

  return actual;
});
