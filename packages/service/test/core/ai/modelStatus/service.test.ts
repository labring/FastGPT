import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { LeaseCache, RedisLeaseUnavailableError } from '@fastgpt/dal/redis/caches';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aggregateRecordsToTimelinePoints,
  checkAndRunModelStatusProbe,
  probeModelStatus,
  runManualModelStatusProbe
} from '../../../../core/ai/modelStatus/service';
import { MongoModelStatusProbeRecord } from '../../../../core/ai/modelStatus/schema';
import { MongoSystemConfigs } from '../../../../common/system/config/schema';
import * as modelStatusService from '../../../../core/ai/modelStatus/service';
import { MODEL_STATUS_REQUEST_TIMEOUT_MS } from '../../../../core/ai/modelStatus/test';

const model: SystemModelDataType = {
  modelId: 'model-status-test-id',
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'test-model',
  name: 'Test model',
  scope: 'system',
  isActive: true,
  config: {
    maxContext: 16000,
    maxResponse: 2000,
    quoteMaxToken: 12000
  }
};

describe('probeModelStatus', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries three times after the initial failure and keeps the successful attempt', async () => {
    const test = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure 1'))
      .mockRejectedValueOnce(new Error('temporary failure 2'))
      .mockRejectedValueOnce(new Error('temporary failure 3'))
      .mockResolvedValueOnce(undefined);

    const result = await probeModelStatus({
      model,
      test
    });

    expect(test).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({
      modelId: model.modelId,
      status: 'green',
      attempts: 4
    });
    expect(result.error).toBeUndefined();
  });

  it('marks a successful request over thirty seconds as yellow', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T00:00:00.000Z'));

    const result = await probeModelStatus({
      model,
      test: vi.fn().mockImplementation(async () => {
        await vi.advanceTimersByTimeAsync(31001);
      })
    });

    expect(result).toMatchObject({ status: 'yellow', latencyMs: 31001, attempts: 1 });
    expect(result.requestEndedAt.getTime() - result.requestStartedAt.getTime()).toBe(31001);
    vi.useRealTimers();
  });

  it('records task start and the final request interval, using a 60-second timeout', async () => {
    vi.useFakeTimers();
    const taskStartedAt = new Date('2026-09-23T00:00:00.000Z');
    vi.setSystemTime(taskStartedAt);
    const test = vi
      .fn()
      .mockImplementation(async ({ onRequestStart }: { onRequestStart?: () => void }) => {
        onRequestStart?.();
        await vi.advanceTimersByTimeAsync(250);
      });

    const result = await probeModelStatus({ model, test });

    expect(test).toHaveBeenCalledWith({
      model,
      teamId: undefined,
      timeoutMs: MODEL_STATUS_REQUEST_TIMEOUT_MS,
      signal: undefined,
      onRequestStart: expect.any(Function)
    });
    expect(result.startedAt).toEqual(taskStartedAt);
    expect(result.requestStartedAt).toEqual(taskStartedAt);
    expect(result.requestEndedAt.getTime() - result.requestStartedAt.getTime()).toBe(250);
    vi.useRealTimers();
  });

  it('does not retry after its lease signal is aborted', async () => {
    const controller = new AbortController();
    const test = vi.fn(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise<void>((_, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        })
    );
    const probe = probeModelStatus({ model, signal: controller.signal, test });
    const expectation = expect(probe).rejects.toThrow('lease lost');

    controller.abort(new Error('lease lost'));

    await expectation;
    expect(test).toHaveBeenCalledTimes(1);
  });

  it('marks the model red after all four attempts fail and keeps a safe error message', async () => {
    const test = vi.fn().mockRejectedValue(new Error('provider unavailable'));

    const result = await probeModelStatus({
      model,
      test
    });

    expect(test).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({
      status: 'red',
      attempts: 4,
      error: 'provider unavailable'
    });
  });

  it('declares the model-time lookup index and 30-day TTL index', () => {
    const indexes = MongoModelStatusProbeRecord.schema.indexes();

    expect(MongoModelStatusProbeRecord.schema.path('requestEndedAt')?.defaultValue).toBeUndefined();
    expect(indexes).toEqual(
      expect.arrayContaining([
        [{ modelId: 1, requestEndedAt: -1 }, expect.any(Object)],
        [{ requestEndedAt: 1 }, expect.objectContaining({ expireAfterSeconds: 30 * 24 * 60 * 60 })]
      ])
    );
  });
});

describe('aggregateRecordsToTimelinePoints', () => {
  it('aggregates raw records into 30-minute buckets and elevates errors to red', () => {
    const records: any[] = [
      {
        modelId: 'test-1',
        status: 'green',
        latencyMs: 120,
        requestEndedAt: new Date('2026-09-23T10:05:00.000Z')
      },
      {
        modelId: 'test-1',
        status: 'red',
        error: 'timeout',
        requestEndedAt: new Date('2026-09-23T10:25:00.000Z')
      },
      {
        modelId: 'test-1',
        status: 'yellow',
        latencyMs: 32000,
        requestEndedAt: new Date('2026-09-23T10:35:00.000Z')
      }
    ];

    const points = aggregateRecordsToTimelinePoints({ records });
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      startTime: new Date('2026-09-23T10:00:00.000Z').toISOString(),
      status: 'red',
      totalChecks: 2,
      failedChecks: 1,
      error: 'timeout',
      latencyMs: 120
    });
    expect(points[1]).toMatchObject({
      startTime: new Date('2026-09-23T10:30:00.000Z').toISOString(),
      status: 'yellow',
      totalChecks: 1,
      failedChecks: 0,
      latencyMs: 32000
    });
  });
});

describe('checkAndRunModelStatusProbe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not run probe if disabled', async () => {
    vi.spyOn(MongoSystemConfigs, 'findOne').mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          value: { enabled: false, intervalMinutes: 5 }
        })
      })
    } as any);
    const runSpy = vi.spyOn(modelStatusService, 'runModelStatusProbe');

    const result = await checkAndRunModelStatusProbe(new Date('2026-09-23T00:05:00.000Z'));

    expect(result).toBeUndefined();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('does not run probe if minute does not match interval', async () => {
    vi.spyOn(MongoSystemConfigs, 'findOne').mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          value: { enabled: true, intervalMinutes: 5 }
        })
      })
    } as any);
    const runSpy = vi.spyOn(modelStatusService, 'runModelStatusProbe');

    // 12:03:00 -> 3 % 5 !== 0
    const result = await checkAndRunModelStatusProbe(new Date('2026-09-23T12:03:00.000Z'));

    expect(result).toBeUndefined();
    expect(runSpy).not.toHaveBeenCalled();
  });
});

describe('runManualModelStatusProbe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws ModelErrEnum.probeTaskRunning when Redis lease is unavailable', async () => {
    vi.spyOn(LeaseCache.prototype, 'withLease').mockRejectedValueOnce(
      new RedisLeaseUnavailableError({
        key: 'ai:model-status:manual-probe',
        label: 'manual-model-status-probe'
      })
    );

    const promise = runManualModelStatusProbe({ teamId: 'test-team' });
    await expect(promise).rejects.toThrowError(ModelErrEnum.probeTaskRunning);
    await expect(promise).rejects.toBeInstanceOf(UserError);
  });
});
