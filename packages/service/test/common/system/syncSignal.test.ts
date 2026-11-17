import { describe, expect, it, vi } from 'vitest';
import {
  createSystemSyncRevisionCoordinator,
  publishSystemSync,
  readAppTemplateRevision,
  readSystemSyncRevisions,
  subscribeSystemSync,
  systemSyncChannel
} from '@fastgpt/service/common/system/syncSignal';

describe('system sync signal', () => {
  it('deduplicates topics on publish and tolerates Redis failures gracefully', async () => {
    const publishSpy = vi.spyOn(systemSyncChannel, 'publish').mockResolvedValue(1);

    await publishSystemSync({
      topics: ['appTemplates', 'appTemplates']
    });

    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(publishSpy).toHaveBeenCalledWith('appTemplates');

    // Redis 故障时应静默降级告警而不向外抛错阻断主写入响应。
    publishSpy.mockRejectedValueOnce(new Error('redis down'));
    await expect(publishSystemSync({ topics: ['appTemplates'] })).resolves.toBeUndefined();
    publishSpy.mockRestore();
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
