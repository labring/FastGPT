import { describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';

const mocks = vi.hoisted(() => ({
  getWorker: vi.fn(() => ({ concurrency: 0 }))
}));

vi.mock('@fastgpt/dal/redis/bullmq', () => ({
  evaluationMQService: { getWorker: mocks.getWorker }
}));

import { getEvaluationWorker } from '@fastgpt/service/core/app/evaluation/mq';
import { publishSystemInstanceConfigSnapshot } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';

describe('getEvaluationWorker', () => {
  it('re-applies the configured concurrency after a snapshot reload', () => {
    const processor = (async () => undefined) as any;

    publishSystemInstanceConfigSnapshot({
      snapshot: resolveSystemInstanceConfig({ performance: { task: { evalConcurrency: 3 } } })
    });
    getEvaluationWorker(processor);
    expect(mocks.getWorker).toHaveBeenLastCalledWith(processor, { concurrency: 3 });

    // 重载后没有新的 init 调用，必须由快照订阅把新并发推给已存在的 Worker
    publishSystemInstanceConfigSnapshot({
      snapshot: resolveSystemInstanceConfig({ performance: { task: { evalConcurrency: 9 } } })
    });
    expect(mocks.getWorker).toHaveBeenLastCalledWith(processor, { concurrency: 9 });
  });
});
