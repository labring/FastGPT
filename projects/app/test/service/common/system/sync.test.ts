import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { publishSystemSync, systemSyncChannel } from '@fastgpt/service/common/system/syncSignal';
import * as templateRegister from '@fastgpt/service/core/app/templates/register';
import {
  cleanupSystemSync,
  reconcileSystemSyncRevisions,
  startSystemSync
} from '@/service/common/system/sync';

describe('startSystemSync (app)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  afterEach(async () => {
    await cleanupSystemSync();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('启动并重启时关闭旧订阅，且不开启任何 Mongo change stream watch', async () => {
    const configWatch = vi.spyOn(MongoSystemInstanceConfig, 'watch');
    const templateWatch = vi.spyOn(MongoAppTemplate, 'watch');
    const trainingWatch = vi.spyOn(MongoDatasetTraining, 'watch');

    await startSystemSync();
    await startSystemSync();

    expect(configWatch).not.toHaveBeenCalled();
    expect(templateWatch).not.toHaveBeenCalled();
    expect(trainingWatch).not.toHaveBeenCalled();
  });

  it('收到 appTemplates 发布事件后防抖并延迟重拉模板', async () => {
    const templateReload = vi
      .spyOn(templateRegister, 'getAppTemplatesAndLoadThem')
      .mockResolvedValue([] as any);

    await startSystemSync();
    await publishSystemSync({ topics: ['appTemplates'] });

    await vi.waitFor(async () => {
      await vi.advanceTimersByTimeAsync(6000);
      expect(templateReload).toHaveBeenCalledWith(true);
    });
  });

  it('支持通过 reconcileSystemSyncRevisions 追平漏掉的修订号变更', async () => {
    const templateReload = vi
      .spyOn(templateRegister, 'getAppTemplatesAndLoadThem')
      .mockResolvedValue([] as any);

    await startSystemSync();

    // 模拟在订阅断线/丢包期间远端修订号递增但 Pub/Sub 消息未送达当前节点。
    const publishSpy = vi.spyOn(redisCacheAdapter, 'publish').mockResolvedValue(0);
    await systemSyncChannel.publish('appTemplates');
    publishSpy.mockRestore();

    await reconcileSystemSyncRevisions();
    await vi.advanceTimersByTimeAsync(6000);

    expect(templateReload).toHaveBeenCalledWith(true);
  });
});
