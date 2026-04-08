import type { Processor } from 'bullmq';
import type { CollectionDeleteJobData } from './index';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { addCollectionDeleteJob } from './index';
import { delCollection } from '../controller';
import { MongoDatasetCollection } from '../schema';
import { MongoDatasetTraining } from '../../training/schema';
import { addLog } from '../../../../common/system/log';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';

// 快速清理：立即删除训练数据（API 调用时同步执行，避免继续消耗资源）
export const deleteCollectionsImmediate = async ({
  teamId,
  datasetIds,
  collectionIds
}: {
  teamId: string;
  datasetIds: string[];
  collectionIds: string[];
}) => {
  await MongoDatasetTraining.deleteMany({
    teamId,
    datasetId: { $in: datasetIds },
    collectionId: { $in: collectionIds }
  });
};

// BullMQ 处理器
export const collectionDeleteProcessor: Processor<CollectionDeleteJobData> = async (job) => {
  const { teamId, collectionIds } = job.data;
  const startTime = Date.now();

  addLog.info(
    `[Collection Delete] Start deleting ${collectionIds.length} collections for team: ${teamId}`
  );

  try {
    // 1. 安全检查：确保所有要删除的 collection 都已标记 deleteTime
    const markedForDelete = await MongoDatasetCollection.find<DatasetCollectionSchemaType>(
      {
        _id: { $in: collectionIds },
        teamId,
        deleteTime: { $ne: null }
      },
      '_id teamId type datasetId fileId metadata'
    ).lean();

    if (markedForDelete.length === 0) {
      addLog.warn(`[Collection Delete] No collections marked for deletion`);
      return;
    }

    if (markedForDelete.length !== collectionIds.length) {
      addLog.warn(
        `[Collection Delete] Safety check: ${markedForDelete.length}/${collectionIds.length} collections marked for deletion`
      );
    }

    // 2. 复用现有的 delCollection 进行实际删除
    await mongoSessionRun((session) =>
      delCollection({
        collections: markedForDelete,
        delImg: true,
        delFile: true,
        session
      })
    );

    addLog.info(`[Collection Delete] Successfully deleted ${markedForDelete.length} collections`, {
      duration: Date.now() - startTime,
      collectionIds
    });
  } catch (error: any) {
    addLog.error(`[Collection Delete] Failed to delete collections`, error);
    throw error; // 抛出错误让 BullMQ 重试
  }
};

// 孤儿软删除清理：扫描 deleteTime 超过阈值但未被物理删除的 collection，重新入队
// threshold: 距 deleteTime 的最小小时数，避免误清理正在处理中的任务
export const collectionCleanup = async (thresholdHours = 24) => {
  const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);

  // 只查询明确有 deleteTime 且超过阈值的 collection
  const orphans = await MongoDatasetCollection.find(
    {
      deleteTime: { $ne: null, $lt: cutoff }
    },
    '_id teamId'
  )
    .limit(500) // 单次最多处理500条，避免内存问题
    .lean();

  if (orphans.length === 0) return;

  addLog.warn(
    `[Collection Delete] Found ${orphans.length} orphan soft-deleted collections, re-enqueuing`
  );

  // 按 teamId 分组，每组单独入队
  const grouped = new Map<string, { teamId: string; ids: string[] }>();
  for (const col of orphans) {
    const key = String(col.teamId);
    if (!grouped.has(key)) {
      grouped.set(key, { teamId: key, ids: [] });
    }
    grouped.get(key)!.ids.push(String(col._id));
  }

  await Promise.all(
    Array.from(grouped.values()).map((group) =>
      addCollectionDeleteJob({
        teamId: group.teamId,
        collectionIds: group.ids
      })
    )
  );
};
