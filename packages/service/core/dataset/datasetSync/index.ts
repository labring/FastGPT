/**
 * Dataset sync 领域对 DAL 队列合同的薄入口。
 *
 * 队列、scheduler 和状态转换集中在 DAL `redis/bullmq/services/datasetSync`；app/pro 的
 * processor 仍留在各自领域目录，避免 DAL 依赖具体向量库和爬虫实现。
 */
export { datasetSyncMQService } from '@fastgpt/dal/redis/bullmq';
export type { DatasetSyncJobData } from '@fastgpt/dal/redis/bullmq';

import { MongoDataset } from '../schema';
import { getLogger, LogCategories } from '../../../common/logger';
import type { JobSchedulerJson } from '@fastgpt/dal/redis/bullmq';
import { datasetSyncMQService, type DatasetSyncJobData } from '@fastgpt/dal/redis/bullmq';
import { enqueueDatasetPermissionSync } from '../datasetPermissionSync';

export const addDatasetSyncJob = (data: DatasetSyncJobData) => datasetSyncMQService.addJob(data);
export const getDatasetSyncDatasetStatus = (datasetId: string) =>
  datasetSyncMQService.getDatasetStatus(datasetId);
/**
 * 注册内容同步 worker，并在结束后补一轮文件权限同步。
 *
 * 权限同步的触发放在这一层而不是 processor 内：旧版 pro 的每日同步不会主动入队，
 * 按旧指针部署时由这里保证外部撤权仍能收敛。入队自身会校验 `permissionSync` 并吞掉错误；
 * 新版 pro 的重复入队由 datasetId 去重键吸收。
 */
export const getDatasetSyncWorker = (
  processor: Parameters<typeof datasetSyncMQService.getWorker>[0]
) =>
  datasetSyncMQService.getWorker(async (job, token) => {
    try {
      return await processor(job, token);
    } finally {
      await enqueueDatasetPermissionSync({ datasetId: String(job.data.datasetId) });
    }
  });
export const getDatasetSyncJobScheduler = (datasetId: string) =>
  datasetSyncMQService.getScheduler(datasetId);
export const removeDatasetSyncJobScheduler = (datasetId: string) =>
  datasetSyncMQService.removeScheduler(datasetId);
export const upsertDatasetSyncJobScheduler = (data: DatasetSyncJobData, startDate?: number) =>
  datasetSyncMQService.upsertScheduler(data, startDate);

const logger = getLogger(LogCategories.MODULE.DATASET);

export type DatasetSyncSchedulerReconcileResult = {
  autoSyncDatasetCount: number;
  schedulerCount: number;
  createdSchedulerCount: number;
  createdDatasetIds: string[];
};

/**
 * 以 Mongo `autoSync=true` 作为期望态，补齐缺失的 BullMQ scheduler。
 *
 * Mongo 查询和 reconcile 属于 dataset domain；队列创建、状态和 scheduler 操作由 DAL
 * BullMQ service 提供，避免队列层反向依赖具体存储模型。
 */
export const reconcileDatasetSyncSchedulers =
  async (): Promise<DatasetSyncSchedulerReconcileResult> => {
    const autoSyncDatasets = await MongoDataset.find(
      {
        autoSync: true,
        $or: [{ deleteTime: null }, { deleteTime: { $exists: false } }]
      },
      '_id'
    ).lean();
    const autoSyncDatasetIds = new Set(autoSyncDatasets.map((dataset) => String(dataset._id)));

    const schedulers = (await datasetSyncMQService
      .getQueue()
      .getJobSchedulers(0, -1, true)) as JobSchedulerJson<DatasetSyncJobData>[];
    const schedulerIds = new Set(
      schedulers.map((scheduler) => String(scheduler.key)).filter(Boolean)
    );

    const createdDatasetIds: string[] = [];
    for (const datasetId of autoSyncDatasetIds) {
      if (schedulerIds.has(datasetId)) continue;

      await datasetSyncMQService.upsertScheduler({ datasetId });
      createdDatasetIds.push(datasetId);
    }

    const result = {
      autoSyncDatasetCount: autoSyncDatasetIds.size,
      schedulerCount: schedulers.length,
      createdSchedulerCount: createdDatasetIds.length,
      createdDatasetIds
    };

    logger.info('Dataset sync scheduler reconcile finished', result);
    return result;
  };
