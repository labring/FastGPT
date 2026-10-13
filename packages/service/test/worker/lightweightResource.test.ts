import { describe, expect, it } from 'vitest';
import {
  createLightweightWorkerResourcePolicy,
  getLightweightWorkerMaxWorkers,
  lightweightWorkerResourceConstants
} from '@fastgpt/service/worker/lightweightResource';

describe('worker/lightweightResource', () => {
  it.each([
    [Number.NaN, 1],
    [0, 1],
    [1, 1],
    [4, 4],
    [5, 5],
    [16, 5]
  ])('可用 CPU 并行度为 %s 时最多创建 %i 个 worker', (parallelism, expected) => {
    expect(getLightweightWorkerMaxWorkers(parallelism)).toBe(expected);
  });

  it('复用文件解析的排队和空闲回收参数', () => {
    expect(lightweightWorkerResourceConstants).toEqual({
      maxWorkers: 5,
      queueTimeoutMs: 30 * 60 * 1000,
      resourcePollIntervalMs: 30 * 1000,
      idleWorkerTimeoutMs: 60 * 1000,
      minIdleWorkers: 1
    });
  });

  it('任务不估算输入内存，仅在剩余可调度内存大于 0 时放行', () => {
    const policy = createLightweightWorkerResourcePolicy<{ value: string }>();
    expect(policy.getTaskResourceBytes({ value: 'large input' })).toBe(0);
    expect(policy.resourcePollIntervalMs).toBe(30 * 1000);

    const canRunTask = policy.canRunTask!;
    expect(
      canRunTask({
        data: { value: 'queued' },
        resourceSnapshot: { availableResourceBytes: 0, maximumTaskResourceBytes: 1024 }
      })
    ).toBe(false);
    expect(
      canRunTask({
        data: { value: 'running' },
        resourceSnapshot: { availableResourceBytes: 1, maximumTaskResourceBytes: 1024 }
      })
    ).toBe(true);
  });
});
