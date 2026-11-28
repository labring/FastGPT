/**
 * 外部文件权限同步的服务层入口。
 *
 * 队列与去重键定义在 DAL `redis/bullmq/services/datasetPermissionSync`；processor 由 pro 注入，
 * 这里只负责入队、状态读取与 worker 绑定。
 */
import { datasetPermissionSyncMQService } from '@fastgpt/dal/redis/bullmq/services/datasetPermissionSync';
import type { DatasetPermissionSyncJobData } from '@fastgpt/dal/redis/bullmq/services/datasetPermissionSync';
import { MongoDataset } from '../schema';
import { isPermissionSyncDataset } from '@fastgpt/global/core/dataset/apiDataset/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { datasetPermissionSyncProcessor } from './processor';

const logger = getLogger(LogCategories.MODULE.DATASET);

/**
 * 入队权限同步。
 *
 * `collectionIds` 传根节点（作业内展开子树），缺省为整库全量。
 * 入队前校验 dataset 存在且 `permissionSync` 开启：调用方（导入接口、每日同步）在业务上已经
 * 判断过，但内部调用可能绕过 schema，这里再守一道，避免为关闭态知识库创建无意义任务。
 */
export const enqueueDatasetPermissionSync = async (data: DatasetPermissionSyncJobData) => {
  try {
    const dataset = await MongoDataset.findOne(
      {
        _id: data.datasetId,
        $or: [{ deleteTime: null }, { deleteTime: { $exists: false } }]
      },
      'apiDatasetServer'
    ).lean();
    if (!dataset || !isPermissionSyncDataset(dataset.apiDatasetServer)) return;

    await datasetPermissionSyncMQService.addJob(data);
  } catch (error) {
    // 查询或入队失败都不应让已提交的导入/同步回滚（入队是旁路，不是业务结果的一部分）：
    // 下一轮每日同步会重新全量收敛。Mongo 抖动也不能把内容同步判成失败。
    logger.warn('[permissionSync] enqueue failed', {
      datasetId: data.datasetId,
      traceId: data.traceId,
      error
    });
  }
};

export const getDatasetPermissionSyncStatus = (datasetId: string) =>
  datasetPermissionSyncMQService.getStatus(datasetId);

/** 注册权限同步 worker；主应用启动时调用，processor 见同目录 processor.ts。 */
export const initDatasetPermissionSyncWorker = () =>
  datasetPermissionSyncMQService.getWorker(datasetPermissionSyncProcessor);
