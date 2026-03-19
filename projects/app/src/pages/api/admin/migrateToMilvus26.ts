import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MilvusCtrl } from '@fastgpt/service/common/vectorDB/milvus/index';
import { DatasetVectorTableName } from '@fastgpt/service/common/vectorDB/constants';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { type DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { delay } from '@fastgpt/global/common/system/utils';
import { startTrainingQueue } from '@/service/core/dataset/training/utils';
import { milvusVersionManager } from '@fastgpt/service/common/vectorDB/milvus/version';
import { addLog } from '@fastgpt/service/common/system/log';

export type MigrateToMilvus26Query = {
  dryRun?: boolean;
};

export type MigrateToMilvus26Response = {
  success: boolean;
  message: string;
  stats: {
    totalDatasets: number;
    totalDataCount: number;
    estimatedMinutes: number;
  };
};

async function handler(
  req: ApiRequestProps<{}, MigrateToMilvus26Query>,
  res: ApiResponseType<MigrateToMilvus26Response>
): Promise<MigrateToMilvus26Response> {
  const { dryRun = false } = req.query;

  await authCert({ req, authRoot: true });

  // 版本检查
  const milvus = new MilvusCtrl();
  const client = await milvus.getClient();
  await milvusVersionManager.resetDetection(client);

  if (!milvusVersionManager.supportsFullText()) {
    return {
      success: false,
      message: `Milvus version is ${milvusVersionManager.getFeatureLevel()}, requires v2.6+`,
      stats: { totalDatasets: 0, totalDataCount: 0, estimatedMinutes: 0 }
    };
  }

  // 统计信息
  const datasets = await MongoDataset.find({}, '_id name teamId tmbId vectorModel').lean();
  const totalDataCount = await MongoDatasetData.countDocuments({});
  const estimatedMinutes = Math.ceil(totalDataCount / 500);

  if (dryRun) {
    addLog.info('[Milvus 2.6 Migration Dry Run]', {
      totalDatasets: datasets.length,
      totalDataCount,
      estimatedMinutes
    });
    return {
      success: true,
      message: 'Dry run completed. No changes made.',
      stats: { totalDatasets: datasets.length, totalDataCount, estimatedMinutes }
    };
  }

  // 检查是否有正在进行的训练任务
  const activeTrainingCount = await MongoDatasetTraining.countDocuments({
    mode: { $in: [TrainingModeEnum.chunk, TrainingModeEnum.qa, TrainingModeEnum.auto] }
  });

  if (activeTrainingCount > 0) {
    return {
      success: false,
      message: `Active training tasks detected (${activeTrainingCount}). Please wait for completion.`,
      stats: { totalDatasets: 0, totalDataCount: 0, estimatedMinutes: 0 }
    };
  }

  // 删除旧 Milvus 集合并重建（带 text、sparse 和 metadata 字段）
  addLog.info('[Milvus 2.6 Migration] Dropping old collection');
  await client.dropCollection({ collection_name: DatasetVectorTableName });

  addLog.info('[Milvus 2.6 Migration] Recreating collection with BM25 full-text schema');
  await milvus.init();

  let dataLength = 0;
  const rebuild = async (dataset: DatasetSchemaType, retry = 3) => {
    try {
      return mongoSessionRun(async (session) => {
        // 标记数据为 rebuilding
        const data = await MongoDatasetData.updateMany(
          { teamId: dataset.teamId, datasetId: dataset._id },
          { $set: { rebuilding: true } },
          { session }
        );
        dataLength += data.matchedCount;

        // 插入训练队列
        const max = global.systemEnv?.vectorMaxProcess || 10;
        const arr = new Array(max * 2).fill(0);

        for (const _ of arr) {
          try {
            const hasNext = await mongoSessionRun(async (session) => {
              const data = await MongoDatasetData.findOneAndUpdate(
                { rebuilding: true },
                { $unset: { rebuilding: null }, $set: { updateTime: new Date() } },
                { session }
              ).select({
                _id: 1,
                collectionId: 1,
                teamId: 1,
                tmbId: 1,
                datasetId: 1
              });

              if (data) {
                await MongoDatasetTraining.create(
                  [
                    {
                      teamId: dataset.teamId,
                      tmbId: dataset.tmbId,
                      datasetId: dataset._id,
                      collectionId: data.collectionId,
                      mode: TrainingModeEnum.chunk,
                      model: dataset.vectorModel,
                      dataId: data._id
                    }
                  ],
                  { session, ordered: true }
                );
              }

              return !!data;
            });

            if (!hasNext) break;
          } catch (error) {
            addLog.error('[Milvus 2.6 Migration] Batch insert error', error);
          }
        }
      });
    } catch (error) {
      addLog.error(`[Milvus 2.6 Migration] Dataset ${dataset._id} rebuild error`, error);
      await delay(500);
      if (retry > 0) {
        return rebuild(dataset, retry - 1);
      }
    }
  };

  // 异步处理所有数据集
  (async () => {
    for (const dataset of datasets) {
      await rebuild(dataset);
    }
    startTrainingQueue();
    addLog.info('[Milvus 2.6 Migration] Complete', {
      totalDatasets: datasets.length,
      dataLength
    });
  })().catch((error) => {
    addLog.error('[Milvus 2.6 Migration] Fatal error', error);
  });

  return {
    success: true,
    message: `Migration started. Processing ${totalDataCount} records from ${datasets.length} datasets. Estimated time: ${estimatedMinutes} minutes. Check logs for progress.`,
    stats: { totalDatasets: datasets.length, totalDataCount, estimatedMinutes }
  };
}

export default NextAPI(handler);
