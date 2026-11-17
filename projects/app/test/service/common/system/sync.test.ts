import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  clearPendingSystemSync,
  publishSystemSync,
  systemSyncChannel
} from '@fastgpt/service/common/system/syncSignal';
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
    clearPendingSystemSync();
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

  it('在 Redis INCR 阶段失败恢复后首轮巡检即触发刷新，并支持 5 分钟有界兜底刷新', async () => {
    const templateReload = vi
      .spyOn(templateRegister, 'getAppTemplatesAndLoadThem')
      .mockResolvedValue([] as any);

    await startSystemSync();

    const incrSpy = vi
      .spyOn(redisCacheAdapter, 'incr')
      .mockRejectedValueOnce(new Error('incr down'));
    await publishSystemSync({ topics: ['appTemplates'] });
    incrSpy.mockRestore();

    await reconcileSystemSyncRevisions();
    await vi.advanceTimersByTimeAsync(6000);
    expect(templateReload).toHaveBeenCalledTimes(1);

    // 修订号未变更且 Redis 正常时短期巡检零刷新，超过 5 分钟有界兜底才强制刷新。
    await reconcileSystemSyncRevisions();
    await vi.advanceTimersByTimeAsync(6000);
    expect(templateReload).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await reconcileSystemSyncRevisions();
    await vi.advanceTimersByTimeAsync(6000);
    expect(templateReload).toHaveBeenCalledTimes(2);
  });
});
