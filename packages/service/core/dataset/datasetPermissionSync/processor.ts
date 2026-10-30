import type { Processor } from '@fastgpt/dal/redis/bullmq';
import { UnrecoverableError } from '@fastgpt/dal/redis/bullmq';
import { withTimeout } from '@fastgpt/global/common/system/utils';
import { DATASET_PERMISSION_SYNC_JOB_TIMEOUT_MS } from '@fastgpt/global/core/dataset/apiDataset/constants';
import { isPermissionSyncDataset } from '@fastgpt/global/core/dataset/apiDataset/utils';
import { MongoDataset } from '../schema';
import { syncCollectionPermissions } from '../apiDataset/permission/sync';
import { getLogger, LogCategories } from '../../../common/logger';
import type { DatasetPermissionSyncJobData } from '@fastgpt/dal/redis/bullmq/services/datasetPermissionSync';

const logger = getLogger(LogCategories.MODULE.DATASET);

/**
 * 外部文件权限同步作业。
 *
 * 每次执行前重读 dataset 开关：作业排队期间可能被关闭，此时重试没有意义，直接不可恢复失败结束。
 * 抓取与分片写入都可能较慢，用整轮超时兜底，避免长期占住单并发 worker；同时把截止时间向下传递，
 * 让超时后的旧任务在下一个检查点停止写入（`withTimeout` 本身不会取消底层 Promise）。
 */
export const datasetPermissionSyncProcessor: Processor<DatasetPermissionSyncJobData> = async (
  job
) => {
  const startedAt = Date.now();
  // 作业级起见日志：sync 内部只在真正进入拉取后才打 round 日志，
  // 早期失败（dataset 被删/开关关闭/超时）在那边看不到。
  logger.info('[permissionSync] job started', {
    jobId: job.id,
    datasetId: job.data.datasetId,
    traceId: job.data.traceId,
    targeted: !!job.data.collectionIds?.length,
    rootCount: job.data.collectionIds?.length ?? 0,
    attempt: job.attemptsMade + 1,
    maxAttempts: job.opts.attempts ?? 1
  });

  const deadlineAt = startedAt + DATASET_PERMISSION_SYNC_JOB_TIMEOUT_MS;
  try {
    const stats = await withTimeout(
      runPermissionSyncJob(job.data, deadlineAt),
      DATASET_PERMISSION_SYNC_JOB_TIMEOUT_MS,
      `Dataset permission sync job timed out: ${job.data.datasetId}`
    );

    logger.info('[permissionSync] job finished', {
      jobId: job.id,
      datasetId: job.data.datasetId,
      traceId: job.data.traceId,
      durationMs: Date.now() - startedAt,
      ...stats
    });
    return stats;
  } catch (error) {
    logger.error('[permissionSync] job failed', {
      jobId: job.id,
      datasetId: job.data.datasetId,
      traceId: job.data.traceId,
      durationMs: Date.now() - startedAt,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts ?? 1,
      error
    });
    throw error;
  }
};

const runPermissionSyncJob = async (
  { datasetId, collectionIds, traceId }: DatasetPermissionSyncJobData,
  deadlineAt: number
) => {
  const dataset = await MongoDataset.findOne(
    { _id: datasetId, $or: [{ deleteTime: null }, { deleteTime: { $exists: false } }] },
    'teamId apiDatasetServer'
  ).lean();

  if (!dataset) {
    throw new UnrecoverableError(`Dataset ${datasetId} not found`);
  }
  if (!isPermissionSyncDataset(dataset.apiDatasetServer)) {
    throw new UnrecoverableError(`Permission sync is not enabled for dataset ${datasetId}`);
  }

  return syncCollectionPermissions({
    teamId: String(dataset.teamId),
    datasetId,
    // 定向任务的 collectionIds 是根节点，由同步逻辑展开子树
    collectionIds,
    traceId,
    deadlineAt
  });
};
