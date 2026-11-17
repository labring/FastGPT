import { afterEach, describe, expect, it, vi } from 'vitest';
import { redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import {
  clearPendingSystemSync,
  createSystemSyncRevisionCoordinator,
  flushPendingSystemSync,
  hasPendingSystemSync,
  publishSystemSync,
  readAppTemplateRevision,
  readSystemSyncRevisions,
  subscribeSystemSync,
  systemSyncChannel
} from '@fastgpt/service/common/system/syncSignal';

describe('system sync signal', () => {
  afterEach(() => {
    clearPendingSystemSync();
    vi.restoreAllMocks();
  });

  it('deduplicates topics on publish and retains recoverable pending state on Redis failure', async () => {
    const publishSpy = vi.spyOn(systemSyncChannel, 'publish').mockResolvedValue(1);

    await publishSystemSync({
      topics: ['appTemplates', 'appTemplates']
    });

    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(publishSpy).toHaveBeenCalledWith('appTemplates');
    expect(hasPendingSystemSync('appTemplates')).toBe(false);

    // Redis 故障时记录待补发失效标记，待恢复后可通过 flushPendingSystemSync 补递增并广播。
    publishSpy.mockRejectedValueOnce(new Error('redis down'));
    await expect(publishSystemSync({ topics: ['appTemplates'] })).resolves.toBeUndefined();
    expect(hasPendingSystemSync('appTemplates')).toBe(true);

    await flushPendingSystemSync();
    expect(publishSpy).toHaveBeenCalledTimes(3);
    expect(hasPendingSystemSync('appTemplates')).toBe(false);
  });

  it('recovers INCR-stage Redis failures on the first reconcile, handles revision resets, and bounds staleness with fallbackIntervalMs', async () => {
    const changed: string[] = [];
    const coordinator = createSystemSyncRevisionCoordinator({
      watchedTopics: ['appTemplates'] as const,
      fallbackIntervalMs: 60_000,
      onTopicChanged: async (topic) => {
        changed.push(topic);
      }
    });

    await coordinator.captureBaseline();
    const initialRev = (await readAppTemplateRevision()) ?? 0;

    // 模拟在 Redis INCR 阶段拒绝（修订号未递增），即使等待多轮也保留待补发状态。
    const incrSpy = vi
      .spyOn(redisCacheAdapter, 'incr')
      .mockRejectedValueOnce(new Error('incr down'));
    await publishSystemSync({ topics: ['appTemplates'] });
    incrSpy.mockRestore();

    expect(hasPendingSystemSync('appTemplates')).toBe(true);
    expect(await readAppTemplateRevision()).toBe(initialRev);

    // Redis 恢复后首轮 reconcile 自动补发递增并立即触发刷新，之后稳态零刷新。
    await coordinator.reconcile();
    expect(hasPendingSystemSync('appTemplates')).toBe(false);
    expect(await readAppTemplateRevision()).toBe(initialRev + 1);
    expect(changed).toEqual(['appTemplates']);

    await coordinator.reconcile();
    expect(changed).toEqual(['appTemplates']);

    // 模拟 Redis 重启丢键导致 remoteRev 回落，reconcile 重置基线并触发刷新。
    const readSpy = vi.spyOn(redisCacheAdapter, 'getMany').mockResolvedValueOnce(['0']);
    await coordinator.reconcile();
    readSpy.mockRestore();
    expect(changed).toEqual(['appTemplates', 'appTemplates']);

    // 修订号长期无变化且超过 fallbackIntervalMs 时触发有界全量兜底。
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    await coordinator.reconcile();
    nowSpy.mockRestore();
    expect(changed).toEqual(['appTemplates', 'appTemplates', 'appTemplates']);
  });

  it('tracks seen revisions, ignores duplicate/stale events, and reconciles lag via MGET', async () => {
    const changed: string[] = [];
    let remote = {
      appTemplates: 4
    };

    const coordinator = createSystemSyncRevisionCoordinator({
      watchedTopics: ['appTemplates'] as const,
      readRevisions: async () => ({ ...remote }),
      onTopicChanged: async (topic) => {
        changed.push(topic);
      }
    });

    await coordinator.captureBaseline();

    // 等于或小于基线的重复通知不触发刷新。
    await coordinator.handlePublishedEvent({ topic: 'appTemplates', revision: 4 });
    expect(changed).toEqual([]);

    // 收到更高修订号立即触发一次刷新，之后重复事件跳过。
    await coordinator.handlePublishedEvent({ topic: 'appTemplates', revision: 5 });
    await coordinator.handlePublishedEvent({ topic: 'appTemplates', revision: 5 });
    expect(changed).toEqual(['appTemplates']);

    // 断线期间 appTemplates 继续递增，reconcile 仅追平滞后项。
    remote = { appTemplates: 7 };
    await coordinator.reconcile();
    expect(changed).toEqual(['appTemplates', 'appTemplates']);

    // 再次巡检且修订号未变时零刷新。
    await coordinator.reconcile();
    expect(changed).toEqual(['appTemplates', 'appTemplates']);
  });

  it('reads revisions and delivers live Pub/Sub events end-to-end against mock Redis', async () => {
    const received: Array<{ topic: string; revision: number }> = [];
    const sub = subscribeSystemSync({
      onTopicChanged: (event) => {
        received.push(event);
      }
    });
    await sub.ready;

    await publishSystemSync({ topics: ['appTemplates'] });
    await vi.waitFor(() =>
      expect(received.some((e) => e.topic === 'appTemplates' && e.revision >= 1)).toBe(true)
    );

    const revisions = await readSystemSyncRevisions();
    const templateRev = await readAppTemplateRevision();
    expect(templateRev).toBeGreaterThanOrEqual(1);
    expect(revisions?.appTemplates).toBe(templateRev);

    await sub.close();
  });
});
