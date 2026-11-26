import type { Processor } from '@fastgpt/dal/redis/bullmq';
import { addDatasetDeleteJob, type DatasetDeleteJobData } from './index';
import {
  delDatasetRelevantData,
  findDatasetAndAllChildren,
  dispatchDatasetStorageCleanup
} from '../controller';
import { MongoDatasetCollectionTags } from '../tag/schema';
import { MongoDatasetCollectionTagsV2 } from '../tag/schemaV2';
import { removeDatasetSyncJobScheduler } from '../datasetSync';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoDataset } from '../schema';
import { MongoDatasetCollection } from '../collection/schema';
import type { ClientSession } from '../../../common/mongo';
import { removeImageByPath } from '../../../common/file/image/controller';
import { getLogger, LogCategories } from '../../../common/logger';
import { resourcePermissionRepo } from '../../../support/permission/repository/resourcePermissionRepo';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { removeDatasetVectorIndexes } from '../vectorData/service';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

/** 在标记知识库删除前，移除这些知识库的定时同步调度。 */
export const removeDatasetSyncSchedulers = async (datasetIds: string[]) => {
  await Promise.all(datasetIds.map(removeDatasetSyncJobScheduler));
};

/** 在删除标记生效时同时撤销在途训练的提交权。 */
export const markDatasetsForDeletion = async (
  { teamId, datasetIds }: { teamId: string; datasetIds?: string[] },
  session: ClientSession
) => {
  const ids = datasetIds && { $in: datasetIds };
  await MongoDataset.updateMany(
    { teamId, ...(ids && { _id: ids }) },
    { $set: { deleteTime: new Date() } },
    { session }
  );
  // 集合版本和 Worker 回写使用同一写锁。也锁住尚未分配 runId 的活跃轮次。
  await MongoDatasetCollection.updateMany(
    { teamId, ...(ids && { datasetId: ids }), 'training.status': 'active' },
    { $unset: { 'training.runId': '' }, $inc: { 'training.revision': 1 } },
    { session }
  );
};

// Clear a team datasets
export const deleteTeamAllDatasets = async (teamId: string) => {
  const datasets = await MongoDataset.find(
    {
      teamId
    },
    { _id: 1, parentId: 1 }
  );
  await removeDatasetSyncSchedulers(datasets.map((dataset) => dataset._id));

  const datasetIdSet = new Set(datasets.map((dataset) => String(dataset._id)));
  const deleteRootDatasets = datasets.filter(
    (dataset) => !dataset.parentId || !datasetIdSet.has(String(dataset.parentId))
  );

  await mongoSessionRun(async (session) => {
    await markDatasetsForDeletion({ teamId }, session);
    await Promise.all(
      deleteRootDatasets.map((dataset) => {
        return addDatasetDeleteJob({
          teamId,
          datasetId: dataset._id
        });
      })
    );
  });
};

/** 等专属索引清理完成再删除业务数据和知识库本体，避免失败后失去重试清理所需的记录。 */
const deleteDatasets = async ({
  teamId,
  datasets
}: {
  teamId: string;
  datasets: { _id: string; avatar: string; teamId: string }[];
}) => {
  const datasetIds = datasets.map((d) => d._id);

  // DDL 可能等待在途建图或旧事务，必须放在 Mongo 事务和其他清理之前。
  await removeDatasetVectorIndexes({ teamId, datasetIds });

  // delete collection.tags
  await MongoDatasetCollectionTags.deleteMany({
    teamId,
    datasetId: { $in: datasetIds }
  });

  await MongoDatasetCollectionTagsV2.deleteMany({
    teamId,
    datasetId: { $in: datasetIds }
  });

  // Delete dataset avatar
  for await (const dataset of datasets) {
    await removeImageByPath(dataset.avatar);
  }

  const cleanupJobs = await mongoSessionRun((session) =>
    delDatasetRelevantData({ datasets, session, deleteDataset: true })
  );
  // 队列失败时保留已软删除的库文档；重试仍能构造总目录，无需逐对象清理记录。
  await dispatchDatasetStorageCleanup(cleanupJobs);

  await mongoSessionRun(async (session) => {
    await resourcePermissionRepo.deleteByResources({
      teamId,
      resourceType: PerResourceTypeEnum.dataset,
      resourceIds: datasetIds,
      session
    });
    await MongoDataset.deleteMany({ teamId, _id: { $in: datasetIds } }, { session });
  });
};

export const datasetDeleteProcessor: Processor<DatasetDeleteJobData> = async (job) => {
  const { teamId, datasetId } = job.data;
  const startTime = Date.now();

  logger.info('Dataset delete started', { teamId, datasetId });

  try {
    // 1. 查找知识库及其所有子知识库
    const datasets = await findDatasetAndAllChildren({
      teamId,
      datasetId,
      fields: '_id teamId avatar'
    });

    if (!datasets || datasets.length === 0) {
      logger.warn('Dataset not found for deletion', { teamId, datasetId });
      return;
    }

    // 2. 安全检查：确保所有要删除的数据集都已标记为 deleteTime
    const markedForDelete = await MongoDataset.find(
      {
        _id: { $in: datasets.map((d) => d._id) },
        teamId,
        deleteTime: { $ne: null }
      },
      { _id: 1 }
    ).lean();

    if (markedForDelete.length !== datasets.length) {
      logger.warn('Dataset delete safety check mismatch', {
        markedCount: markedForDelete.length,
        totalCount: datasets.length,
        markedDatasetIds: markedForDelete.map((d) => d._id),
        totalDatasetIds: datasets.map((d) => d._id)
      });
      // 软删除标记是禁止后续建图的业务屏障；未提交标记时不能越过索引清理开始物理删除。
      throw new Error('Dataset deletion requires every dataset to be marked for deletion');
    }

    // 3. 执行真正的删除操作（只删除已经标记为 deleteTime 的数据）
    await deleteDatasets({
      teamId,
      datasets
    });

    logger.info('Dataset delete completed', {
      datasetId,
      teamId,
      durationMs: Date.now() - startTime,
      totalDatasets: datasets.length,
      datasetIds: datasets.map((d) => d._id)
    });
  } catch (error: any) {
    logger.error('Dataset delete failed', { teamId, datasetId, error });
    throw error;
  }
};
