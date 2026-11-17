import { debounce } from 'lodash-es';
import type { RedisChannelSubscription } from '@fastgpt/dal/redis/adapter';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  createSystemSyncRevisionCoordinator,
  subscribeSystemSync
} from '@fastgpt/service/common/system/syncSignal';
import { getAppTemplatesAndLoadThem } from '@fastgpt/service/core/app/templates/register';
import { subscribeDatasetTrainingQueue } from '@/service/core/dataset/training/utils';

const logger = getLogger(LogCategories.SYSTEM);

let activeSubscriptions: RedisChannelSubscription[] = [];
let pendingTemplateTimer: ReturnType<typeof setTimeout> | undefined;

const triggerAppTemplatesReload = () => {
  if (pendingTemplateTimer !== undefined) {
    clearTimeout(pendingTemplateTimer);
  }
  // 模板管理端修改常成批连续提交，延迟 5s 拉库避免读到半成品。
  pendingTemplateTimer = setTimeout(() => {
    pendingTemplateTimer = undefined;
    void Promise.resolve(getAppTemplatesAndLoadThem(true)).catch((error) =>
      logger.error('App templates reload failed during Redis sync', { error })
    );
  }, 5000);
};

const debouncedAppTemplatesReload = debounce(triggerAppTemplatesReload, 500);

const SYSTEM_SYNC_FALLBACK_INTERVAL_MS = 5 * 60 * 1000;

const syncCoordinator = createSystemSyncRevisionCoordinator({
  watchedTopics: ['appTemplates'] as const,
  // 跨进程场景若写端递增 Redis revision 失败后进程退出，由 5 分钟有界兜底截断最长陈旧窗口。
  fallbackIntervalMs: SYSTEM_SYNC_FALLBACK_INTERVAL_MS,
  onTopicChanged: async () => {
    debouncedAppTemplatesReload();
  }
});

/** 定期检查 Redis 修订号兜底（常规稳态仅执行单次 MGET，无变更零 DB 查询）。 */
export const reconcileSystemSyncRevisions = () => syncCoordinator.reconcile();

export const cleanupSystemSync = async () => {
  debouncedAppTemplatesReload.cancel();
  if (pendingTemplateTimer !== undefined) {
    clearTimeout(pendingTemplateTimer);
    pendingTemplateTimer = undefined;
  }

  const subscriptions = activeSubscriptions;
  activeSubscriptions = [];
  await Promise.all(subscriptions.map((subscription) => subscription.close()));
};

/** 启动模板与训练队列的 Redis Pub/Sub 同步（实例配置由常驻轮询刷新，模型目录按自身 revision 刷新）。 */
export const startSystemSync = async () => {
  await cleanupSystemSync();
  await syncCoordinator.captureBaseline();

  const systemSub = subscribeSystemSync({
    onTopicChanged: syncCoordinator.handlePublishedEvent,
    onReconnect: () => syncCoordinator.reconcile()
  });
  const trainingSub = subscribeDatasetTrainingQueue();

  activeSubscriptions = [systemSub, trainingSub];
  await Promise.all([systemSub.ready, trainingSub.ready]);
  // 对齐启动期间可能已经落库的修订号变更。
  await syncCoordinator.reconcile();
  logger.info('Redis pub/sub system sync started');

  return cleanupSystemSync;
};
