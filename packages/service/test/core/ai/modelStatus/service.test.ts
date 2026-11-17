import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { LeaseCache, RedisLeaseUnavailableError } from '@fastgpt/dal/redis/caches';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aggregateRecordsToTimelinePoints,
  checkAndRunModelStatusProbe,
  getModelStatusProbeConfig,
  probeModelStatus,
  runManualModelStatusProbe,
  testModelStatusWebhook,
  updateModelStatusProbeConfig
} from '../../../../core/ai/modelStatus/service';
import { MongoModelStatusProbeRecord } from '../../../../core/ai/modelStatus/schema';
import { MongoSystemInstanceConfig } from '../../../../common/system/systemInstanceConfig/schema';
import { systemInstanceConfig } from '../../../../common/system/systemInstanceConfig/service';
import * as modelStatusService from '../../../../core/ai/modelStatus/service';
import { MODEL_TEST_TIMEOUT_MS } from '../../../../core/ai/model/test';
import { decryptDomainSecrets } from '../../../../common/system/systemInstanceConfig/secrets';

beforeEach(() => {
  global.systemInstanceConfig = createDefaultInstanceConfig();
});

const model: AIModelDataType = {
  modelId: 'model-status-test-id',
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'test-model',
  name: 'Test model',
  scope: ModelScopeEnum.system,
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
      timeoutMs: MODEL_TEST_TIMEOUT_MS,
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
        new Promise<undefined>((_, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        })
    );
    const probe = probeModelStatus({ model, signal: controller.signal, test });
    const expectation = expect(probe).rejects.toThrow('lease lost');

    controller.abort(new Error('lease lost'));

    await expectation;
    expect(test).toHaveBeenCalledTimes(1);
  });

  it('marks the model red after all four attempts fail and identifies it in the timeout error', async () => {
    const test = vi.fn().mockRejectedValue(new Error('Model test timed out after 60000ms'));

    const result = await probeModelStatus({
      model,
      test
    });

    expect(test).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({
      status: 'red',
      attempts: 4,
      error: 'Test model: Model test timed out after 60000ms'
    });
  });

  it('declares the model-time lookup index and 30-day TTL index', () => {
    const indexes = MongoModelStatusProbeRecord.schema.indexes();

    const path = MongoModelStatusProbeRecord.schema.path('requestEndedAt') as unknown as {
      defaultValue?: unknown;
    };
    expect(path.defaultValue).toBeUndefined();
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

describe('model status probe configuration', () => {
  it('reads the current snapshot without querying the persisted scope', async () => {
    const findSpy = vi.spyOn(MongoSystemInstanceConfig, 'findOne');
    expect(await getModelStatusProbeConfig()).toEqual({
      enabled: false,
      intervalMinutes: 5,
      webhookTokenConfigured: false
    });

    getTestInstanceConfig().modelStatusProbe = {
      enabled: true,
      intervalMinutes: 15,
      webhookToken: 'snapshot-token'
    };
    expect(await getModelStatusProbeConfig()).toEqual({
      enabled: true,
      intervalMinutes: 15,
      webhookTokenConfigured: true
    });
    expect(findSpy).not.toHaveBeenCalled();
    findSpy.mockRestore();
  });

  it('encrypts the token, reuses ciphertext on partial saves, and replaces or clears it', async () => {
    await updateModelStatusProbeConfig({
      enabled: true,
      intervalMinutes: 10,
      webhookUrl: 'https://example.com/hook',
      webhookToken: 'stored-token',
      clearWebhookToken: false
    });
    const first = await MongoSystemInstanceConfig.findOne({ domain: 'modelStatusProbe' }).lean();
    expect(first).toMatchObject({
      revision: 1,
      overrides: {
        enabled: true,
        intervalMinutes: 10,
        webhookUrl: 'https://example.com/hook',
        webhookToken: { secret: expect.any(String) }
      }
    });
    const firstOverrides = first?.overrides as { webhookToken?: { secret: string } } | undefined;
    const firstCipher = firstOverrides?.webhookToken;
    expect(JSON.stringify(first?.overrides)).not.toContain('stored-token');
    expect(decryptDomainSecrets('modelStatusProbe', firstOverrides)).toMatchObject({
      webhookToken: 'stored-token'
    });
    expect(getTestInstanceConfig().modelStatusProbe.webhookToken).toBe('stored-token');

    expect(await getModelStatusProbeConfig()).toMatchObject({ enabled: true, intervalMinutes: 10 });
    // 写入时必须从主库合并凭据，即使本进程快照尚未更新。
    getTestInstanceConfig().modelStatusProbe = { enabled: false, intervalMinutes: 5 };
    expect(
      await updateModelStatusProbeConfig({
        enabled: false,
        intervalMinutes: 15,
        clearWebhookToken: false
      })
    ).toEqual({
      enabled: false,
      intervalMinutes: 15,
      webhookUrl: 'https://example.com/hook',
      webhookTokenConfigured: true
    });
    const second = await MongoSystemInstanceConfig.findOne({ domain: 'modelStatusProbe' }).lean();
    expect(second).toMatchObject({
      _id: first?._id,
      revision: 2,
      overrides: { enabled: false, intervalMinutes: 15, webhookToken: firstCipher }
    });
    expect(await MongoSystemInstanceConfig.countDocuments({ domain: 'modelStatusProbe' })).toBe(1);

    const response = await updateModelStatusProbeConfig({
      enabled: false,
      intervalMinutes: 15,
      webhookToken: 'replacement-token',
      clearWebhookToken: false
    });
    const replaced = await MongoSystemInstanceConfig.findOne({ domain: 'modelStatusProbe' }).lean();
    const replacedOverrides = replaced?.overrides as
      | { webhookToken?: { secret: string } }
      | undefined;
    expect(replacedOverrides?.webhookToken).toEqual({ secret: expect.any(String) });
    expect(replacedOverrides?.webhookToken).not.toEqual(firstCipher);
    expect(getTestInstanceConfig().modelStatusProbe.webhookToken).toBe('replacement-token');
    expect(JSON.stringify(response)).not.toContain('replacement-token');
    expect(JSON.stringify(response)).not.toContain(replacedOverrides?.webhookToken?.secret ?? '');

    await updateModelStatusProbeConfig({
      enabled: false,
      intervalMinutes: 5,
      webhookUrl: '',
      clearWebhookToken: true
    });
    const cleared = await MongoSystemInstanceConfig.findOne({ domain: 'modelStatusProbe' }).lean();
    expect(cleared?.revision).toBe(4);
    expect(cleared?.overrides).toEqual({ enabled: false, intervalMinutes: 5 });
    expect(getTestInstanceConfig().modelStatusProbe.webhookToken).toBeUndefined();
  });

  it('accepts legacy plaintext and encrypts it when saving a partial update', async () => {
    await MongoSystemInstanceConfig.collection.insertOne({
      domain: 'modelStatusProbe',
      overrides: { enabled: true, intervalMinutes: 10, webhookToken: 'legacy-token' },
      revision: 1
    } as any);

    const response = await updateModelStatusProbeConfig({
      enabled: false,
      intervalMinutes: 15,
      clearWebhookToken: false
    });
    const saved = await MongoSystemInstanceConfig.findOne({ domain: 'modelStatusProbe' }).lean();
    expect(saved).toMatchObject({
      revision: 2,
      overrides: { webhookToken: { secret: expect.any(String) } }
    });
    expect(getTestInstanceConfig().modelStatusProbe.webhookToken).toBe('legacy-token');
    expect(response.webhookTokenConfigured).toBe(true);
    expect(JSON.stringify(response)).not.toContain('legacy-token');
  });

  it('rejects corrupt ciphertext without overwriting its configuration', async () => {
    const invalidCipher = `${'0'.repeat(32)}:00:${'0'.repeat(32)}`;
    await MongoSystemInstanceConfig.collection.insertOne({
      domain: 'modelStatusProbe',
      overrides: { enabled: true, intervalMinutes: 10, webhookToken: { secret: invalidCipher } },
      revision: 1
    } as any);

    await expect(
      updateModelStatusProbeConfig({ enabled: false, intervalMinutes: 5, clearWebhookToken: false })
    ).rejects.toThrow('Unable to decrypt configuration secret: modelStatusProbe.webhookToken');
    expect(
      await MongoSystemInstanceConfig.findOne({ domain: 'modelStatusProbe' }).lean()
    ).toMatchObject({
      revision: 1,
      overrides: { enabled: true, webhookToken: { secret: invalidCipher } }
    });
  });

  it('rejects invalid stored configuration before overwriting its credentials', async () => {
    await MongoSystemInstanceConfig.collection.insertOne({
      domain: 'modelStatusProbe',
      overrides: { enabled: true, intervalMinutes: 1, webhookToken: 'stored-token' },
      revision: 1
    } as any);

    await expect(
      updateModelStatusProbeConfig({ enabled: false, intervalMinutes: 5, clearWebhookToken: false })
    ).rejects.toThrow();
    const record = await MongoSystemInstanceConfig.findOne({ domain: 'modelStatusProbe' }).lean();
    expect(record).toMatchObject({ revision: 1, overrides: { webhookToken: 'stored-token' } });
  });

  it('keeps the successful write when refreshing the snapshot fails', async () => {
    vi.spyOn(systemInstanceConfig, 'refresh').mockRejectedValueOnce(new Error('refresh failed'));
    try {
      await expect(
        updateModelStatusProbeConfig({
          enabled: true,
          intervalMinutes: 10,
          clearWebhookToken: false
        })
      ).resolves.toMatchObject({ enabled: true, intervalMinutes: 10 });
      const record = await MongoSystemInstanceConfig.findOne({ domain: 'modelStatusProbe' }).lean();
      expect(record).toMatchObject({ revision: 1, overrides: { enabled: true } });
      expect((await getModelStatusProbeConfig()).enabled).toBe(false);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe('checkAndRunModelStatusProbe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not run probe if disabled', async () => {
    const runSpy = vi.spyOn(modelStatusService, 'runModelStatusProbe');

    const result = await checkAndRunModelStatusProbe(new Date('2026-09-23T00:05:00.000Z'));

    expect(result).toBeUndefined();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('does not run probe if minute does not match interval', async () => {
    getTestInstanceConfig().modelStatusProbe.enabled = true;
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

describe('testModelStatusWebhook', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws UserError when webhookUrl is not provided and not configured', async () => {
    await expect(testModelStatusWebhook()).rejects.toThrowError(UserError);
  });

  it('sends one error and one recovered message sequentially with bearer token', async () => {
    getTestInstanceConfig().modelStatusProbe.webhookToken = 'stored-token';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('ok')
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await testModelStatusWebhook({
      webhookUrl: 'https://example.com/webhook',
      webhookToken: 'custom-token'
    });

    expect(res).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall[0]).toBe('https://example.com/webhook');
    expect(firstCall[1].headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer custom-token'
    });
    const firstBody = JSON.parse(firstCall[1].body);
    expect(firstBody.event).toBe('model_status_error');
    expect(firstBody.status).toBe('red');

    const secondCall = fetchMock.mock.calls[1];
    expect(secondCall[0]).toBe('https://example.com/webhook');
    const secondBody = JSON.parse(secondCall[1].body);
    expect(secondBody.event).toBe('model_status_recovered');
    expect(secondBody.status).toBe('green');
  });

  it('uses the stored token only when the test request omits the token', async () => {
    getTestInstanceConfig().modelStatusProbe.webhookToken = 'stored-token';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await testModelStatusWebhook({ webhookUrl: 'https://example.com/webhook' });
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer stored-token'
    });
    fetchMock.mockClear();
    await testModelStatusWebhook({ webhookUrl: 'https://example.com/webhook', webhookToken: '' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('throws UserError if webhook returns non-2xx status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('Internal Server Error')
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      testModelStatusWebhook({ webhookUrl: 'https://example.com/webhook' })
    ).rejects.toThrowError(UserError);
  });
});
