import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkAndRunModelStatusProbe,
  probeModelStatus
} from '../../../../core/ai/modelStatus/service';
import { MongoModelStatusProbeRecord } from '../../../../core/ai/modelStatus/schema';
import { MongoSystemConfigs } from '../../../../common/system/config/schema';
import * as modelStatusService from '../../../../core/ai/modelStatus/service';

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
      testedAt: new Date('2026-09-23T00:00:00.000Z'),
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
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(32001);

    const result = await probeModelStatus({
      model,
      testedAt: new Date('2026-09-23T00:00:00.000Z'),
      test: vi.fn().mockResolvedValue(undefined)
    });

    expect(result).toMatchObject({ status: 'yellow', latencyMs: 31001, attempts: 1 });
  });

  it('marks the model red after all four attempts fail and keeps a safe error message', async () => {
    const test = vi.fn().mockRejectedValue(new Error('provider unavailable'));

    const result = await probeModelStatus({
      model,
      testedAt: new Date('2026-09-23T00:00:00.000Z'),
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

    expect(indexes).toEqual(
      expect.arrayContaining([
        [{ modelId: 1, testedAt: -1 }, expect.any(Object)],
        [{ testedAt: 1 }, expect.objectContaining({ expireAfterSeconds: 30 * 24 * 60 * 60 })]
      ])
    );
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
