import { availableParallelism } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { WorkerNameEnum } from '@fastgpt/service/worker/utils';

const { mockRun, mockGetWorkerController } = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockGetWorkerController: vi.fn()
}));

vi.mock('@fastgpt/global/common/system/constants', () => ({
  isTestEnv: false
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    PARSE_FILE_TIMEOUT_SECONDS: 300
  }
}));

vi.mock('@fastgpt/service/worker/utils', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/worker/utils')>();
  return {
    ...mod,
    getWorkerController: mockGetWorkerController
  };
});

const { text2Chunks } = await import('@fastgpt/service/worker/function');

describe('worker/function production text2Chunks', () => {
  it('使用 CPU 上限、内存准入、排队超时和空闲回收策略', async () => {
    mockRun.mockResolvedValueOnce({ chunks: ['content'] });
    mockGetWorkerController.mockReturnValueOnce({ run: mockRun });

    const props = { text: 'content', chunkSize: 100, maxSize: 200 };
    await expect(text2Chunks(props)).resolves.toEqual({ chunks: ['content'] });

    const poolConfig = mockGetWorkerController.mock.calls[0][0];
    expect(poolConfig.name).toBe(WorkerNameEnum.text2Chunks);
    expect(poolConfig.maxReservedThreads).toBe(Math.min(availableParallelism(), 5));
    expect(poolConfig.taskTimeoutMs).toBe(5 * 60 * 1000);
    expect(poolConfig.maxTasksPerWorker).toBe(100);
    expect(poolConfig.resourcePolicy.queueTimeoutMs).toBe(30 * 60 * 1000);
    expect(poolConfig.resourcePolicy.resourcePollIntervalMs).toBe(30 * 1000);
    expect(poolConfig.resourcePolicy.getTaskResourceBytes(props)).toBe(0);
    expect(poolConfig.idleWorkerTimeoutMs).toBe(60 * 1000);
    expect(poolConfig.minIdleWorkers).toBe(1);
    expect(mockRun).toHaveBeenCalledWith(props);
  });
});
