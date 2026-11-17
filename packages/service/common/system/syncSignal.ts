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

/**
 * 广播系统配置、License 或模板变更通知，并同步递增 Redis 修订号。
 *
 * 写入方若处于 `mongoSessionRun` 事务内，通知会自动延迟到事务 commit 之后执行，
 * 避免订阅节点在提交前读到旧快照。Redis 短暂不可用时仅记录告警，由连接重连与 Cron 兜底。
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
      try {
        await systemSyncChannel.publish(topic);
      } catch (error) {
        getSyncLogger()?.warn?.('Failed to publish system sync revision', { topic, error });
      }
    }
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
};

/**
 * 多实例同步状态追踪器：合并 Pub/Sub 实时事件与重连 / Cron `MGET` Revision 兜底。
 *
 * Pub/Sub 到达时推进本地已见修订号；断线重连或每分钟巡检仅在 Redis revision 大于本地
 * 已见值时触发补偿重载，常规稳态零数据库查询。
 */
export const createSystemSyncRevisionCoordinator = <TTopic extends SystemSyncTopic>({
  watchedTopics,
  onTopicChanged,
  readRevisions = readSystemSyncRevisions
}: RevisionSyncCoordinatorOptions<TTopic>) => {
  const watchedSet = new Set<string>(watchedTopics);
  const seenRevisions = new Map<TTopic, number>();

  const captureBaseline = async (overrideRevisions?: Record<SystemSyncTopic, number>) => {
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
    return onTopicChanged(typedTopic);
  };

  const reconcile = async () => {
    const remoteRevisions = await readRevisions();
    if (remoteRevisions === undefined) {
      return;
    }
    for (const topic of watchedTopics) {
      const remoteRev = remoteRevisions[topic] ?? 0;
      const currentSeen = seenRevisions.get(topic) ?? 0;
      if (remoteRev > currentSeen) {
        seenRevisions.set(topic, remoteRev);
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
