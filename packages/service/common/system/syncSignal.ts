import { RevisionSyncChannel } from '@fastgpt/dal/redis/caches/pubSubSync';
import { getLogger, LogCategories } from '../logger';
import type { ClientSession } from '../mongo';
import { afterMongoCommit } from '../mongo/sessionCommitHook';

export const SYSTEM_SYNC_TOPICS = ['appTemplates'] as const;

export type SystemSyncTopic = (typeof SYSTEM_SYNC_TOPICS)[number];

// Avoid resolving logger at module load time so partial test mocks on LogCategories don't crash on import.
const getSyncLogger = () => getLogger(LogCategories?.SYSTEM);

export const systemSyncChannel = new RevisionSyncChannel<SystemSyncTopic>({
  namespace: 'system:sync',
  topics: SYSTEM_SYNC_TOPICS
});

const BASE_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 30_000;
const pendingTopics = new Set<SystemSyncTopic>();
let pendingFlushPromise: Promise<void> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryAttempt = 0;

const clearRetryTimer = () => {
  if (retryTimer !== undefined) {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }
};

const scheduleRetryFlush = () => {
  if (pendingTopics.size === 0 || retryTimer !== undefined) {
    return;
  }
  const delayMs = Math.min(BASE_RETRY_DELAY_MS * 2 ** retryAttempt, MAX_RETRY_DELAY_MS);
  retryAttempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    void flushPendingSystemSync();
  }, delayMs);
  // 允许短生命周期脚本与单测进程自然退出，不被后台退避定时器阻塞。
  retryTimer.unref?.();
};

/** 判断指定 topic 是否仍存在因 Redis `INCR` / `PUBLISH` 失败而滞留的待补发失效记录。 */
export const hasPendingSystemSync = (topic: SystemSyncTopic): boolean => pendingTopics.has(topic);

/** 清空进程内待补发同步记录与重试定时器（供测试隔离或生命周期清理调用）。 */
export const clearPendingSystemSync = () => {
  pendingTopics.clear();
  retryAttempt = 0;
  clearRetryTimer();
};

/**
 * 补发此前因 Redis 异常而滞留的系统同步修订号通知。
 *
 * 只有在 `INCR` 与 `PUBLISH` 完整成功后才移除对应 topic，保证 `INCR` 从未成功的写入不会静默丢失。
 */
export const flushPendingSystemSync = async (
  topics?: readonly SystemSyncTopic[]
): Promise<void> => {
  const candidates = (topics ?? [...pendingTopics]).filter((topic) => pendingTopics.has(topic));
  if (candidates.length === 0) {
    return;
  }

  if (pendingFlushPromise !== undefined) {
    await pendingFlushPromise;
    if (!candidates.some((topic) => pendingTopics.has(topic))) {
      return;
    }
  }

  const runFlush = async () => {
    for (const topic of candidates) {
      if (!pendingTopics.has(topic)) {
        continue;
      }
      try {
        await systemSyncChannel.publish(topic);
        pendingTopics.delete(topic);
      } catch (error) {
        getSyncLogger()?.warn?.('Failed to flush pending system sync revision', { topic, error });
      }
    }

    if (pendingTopics.size === 0) {
      retryAttempt = 0;
      clearRetryTimer();
    } else {
      scheduleRetryFlush();
    }
  };

  pendingFlushPromise = runFlush().finally(() => {
    pendingFlushPromise = undefined;
  });
  await pendingFlushPromise;
};

/**
 * 广播模板等系统变更通知，并同步递增 Redis 修订号。
 *
 * 写入方若处于 `mongoSessionRun` 事务内，通知会自动延迟到事务 commit 之后执行，
 * 避免订阅节点在提交前读到旧快照。若 `INCR` 或 `PUBLISH` 失败，保留待补发状态并安排
 * 退避重试，同时在 `reconcile` 与本地读取路径触发补偿恢复，避免旧缓存长期滞留。
 */
export const publishSystemSync = async ({
  topics,
  session
}: {
  topics: readonly SystemSyncTopic[];
  session?: ClientSession | null;
}): Promise<void> => {
  const uniqueTopics = Array.from(new Set(topics));
  if (uniqueTopics.length === 0) {
    return;
  }

  await afterMongoCommit(session, async () => {
    for (const topic of uniqueTopics) {
      pendingTopics.add(topic);
    }
    await flushPendingSystemSync(Array.from(new Set([...pendingTopics, ...uniqueTopics])));
  });
};

export const readSystemSyncRevisions = async (): Promise<
  Record<SystemSyncTopic, number> | undefined
> => {
  try {
    return await systemSyncChannel.readRevisions();
  } catch (error) {
    getSyncLogger()?.warn?.('Failed to read system sync revisions', { error });
    return undefined;
  }
};

export const readAppTemplateRevision = async (): Promise<number | undefined> => {
  try {
    return await systemSyncChannel.readRevision('appTemplates');
  } catch (error) {
    getSyncLogger()?.warn?.('Failed to read app template sync revision', { error });
    return undefined;
  }
};

export const subscribeSystemSync = ({
  onTopicChanged,
  onReconnect
}: {
  onTopicChanged: (event: { topic: SystemSyncTopic; revision: number }) => Promise<void> | void;
  onReconnect?: () => Promise<void> | void;
}) =>
  systemSyncChannel.subscribe({
    onTopicChanged,
    onReconnect,
    logger: getSyncLogger()
  });

export type RevisionSyncCoordinatorOptions<TTopic extends SystemSyncTopic> = {
  watchedTopics: readonly TTopic[];
  onTopicChanged: (topic: TTopic) => Promise<void> | void;
  readRevisions?: () => Promise<Record<SystemSyncTopic, number> | undefined>;
  /** 独立于 Redis revision 的有界全量兜底间隔（毫秒）；到点后即使 revision 未增长也强制触发刷新。 */
  fallbackIntervalMs?: number;
};

/**
 * 多实例同步状态追踪器：合并 Pub/Sub 实时事件、待补发修订号冲洗、Redis 重启重置检测及有界 Cron 兜底。
 *
 * Pub/Sub 到达时推进本地已见修订号；`reconcile` 先补发本进程滞留的失效记录，再执行单次 `MGET`
 * 比对（同时兼容 Redis 重启导致 revision 回落，以及跨进程写入端失联时的有界兜底刷新）。
 */
export const createSystemSyncRevisionCoordinator = <TTopic extends SystemSyncTopic>({
  watchedTopics,
  onTopicChanged,
  readRevisions = readSystemSyncRevisions,
  fallbackIntervalMs
}: RevisionSyncCoordinatorOptions<TTopic>) => {
  const watchedSet = new Set<string>(watchedTopics);
  const seenRevisions = new Map<TTopic, number>();
  const lastSyncedAt = new Map<TTopic, number>();

  const captureBaseline = async (overrideRevisions?: Record<SystemSyncTopic, number>) => {
    const now = Date.now();
    for (const topic of watchedTopics) {
      if (!lastSyncedAt.has(topic)) {
        lastSyncedAt.set(topic, now);
      }
    }

    const revisions = overrideRevisions ?? (await readRevisions());
    if (revisions === undefined) {
      return;
    }
    for (const topic of watchedTopics) {
      seenRevisions.set(topic, Math.max(seenRevisions.get(topic) ?? 0, revisions[topic] ?? 0));
    }
  };

  const handlePublishedEvent = ({
    topic,
    revision
  }: {
    topic: SystemSyncTopic;
    revision: number;
  }) => {
    if (!watchedSet.has(topic)) {
      return;
    }
    const typedTopic = topic as TTopic;
    const currentSeen = seenRevisions.get(typedTopic) ?? 0;
    if (revision <= currentSeen) {
      return;
    }
    seenRevisions.set(typedTopic, revision);
    lastSyncedAt.set(typedTopic, Date.now());
    return onTopicChanged(typedTopic);
  };

  const reconcile = async () => {
    // 若本地仍有 `INCR` 失败滞留的失效记录，优先在比对前补发递增，确保单机/测试场景首轮巡检即生效。
    if (watchedTopics.some((topic) => hasPendingSystemSync(topic))) {
      await flushPendingSystemSync(watchedTopics);
    }

    // 读取前快照本地已见值，区分“Redis 丢键重置”与“读期间并发到达更高 Pub/Sub 事件”。
    const seenBeforeRead = new Map<TTopic, number>();
    for (const topic of watchedTopics) {
      seenBeforeRead.set(topic, seenRevisions.get(topic) ?? 0);
    }

    const remoteRevisions = await readRevisions();
    const now = Date.now();

    if (remoteRevisions === undefined) {
      if (fallbackIntervalMs === undefined) {
        return;
      }
      for (const topic of watchedTopics) {
        if (now - (lastSyncedAt.get(topic) ?? 0) >= fallbackIntervalMs) {
          lastSyncedAt.set(topic, now);
          await onTopicChanged(topic);
        }
      }
      return;
    }

    for (const topic of watchedTopics) {
      const remoteRev = remoteRevisions[topic] ?? 0;
      const currentSeen = seenRevisions.get(topic) ?? 0;
      const isRevisionAdvanced = remoteRev > currentSeen;
      const isRedisRevisionReset =
        seenBeforeRead.get(topic) === currentSeen && remoteRev < currentSeen;
      const isFallbackDue =
        fallbackIntervalMs !== undefined &&
        now - (lastSyncedAt.get(topic) ?? 0) >= fallbackIntervalMs;

      if (isRevisionAdvanced || isRedisRevisionReset || isFallbackDue) {
        seenRevisions.set(topic, remoteRev);
        lastSyncedAt.set(topic, now);
        await onTopicChanged(topic);
      }
    }
  };

  return {
    captureBaseline,
    handlePublishedEvent,
    reconcile
  };
};
