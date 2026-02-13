import { retryFn } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  deleteDatasetDataVector,
  getVectorDataByTime
} from '@fastgpt/service/common/vectorDB/controller';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
const logger = getLogger(LogCategories.MODULE.DATASET.QUEUES);

/*
  检测无效的 Mongo 数据
  异常情况：
  1. 训练过程删除知识库，可能导致还会有新的数据继续插入，导致无效。
*/
export async function checkInvalidDatasetData(start: Date, end: Date) {
  // 1. 获取时间范围的所有data
  const rows = await MongoDatasetData.find(
    {
      updateTime: {
        $gte: start,
        $lte: end
      }
    },
    '_id teamId datasetId collectionId'
  ).lean();

  // 2. 合并所有的collectionId
  const map = new Map<string, { teamId: string; datasetId: string; collectionId: string }>();
  for (const item of rows) {
    const collectionId = String(item.collectionId);
    if (!map.has(collectionId)) {
      map.set(collectionId, {
        teamId: item.teamId,
        datasetId: item.datasetId,
        collectionId
      });
    }
  }
  const list = Array.from(map.values());
  logger.info('Start cleaning invalid dataset data records', {
    totalCollections: list.length,
    start,
    end
  });
  let index = 0;

  for await (const item of list) {
    try {
      // 3. 查看该collection是否存在，不存在，则删除对应的数据
      const collection = await MongoDatasetCollection.findOne(
        { _id: item.collectionId },
        '_id'
      ).lean();
      if (!collection) {
        logger.warn('Dataset collection not found, cleaning related records', { ...item });

        await retryFn(async () => {
          await MongoDatasetTraining.deleteMany({
            teamId: item.teamId,
            datasetId: item.datasetId,
            collectionId: item.collectionId
          });

          await Promise.all([
            MongoDatasetDataText.deleteMany({
              teamId: item.teamId,
              datasetId: item.datasetId,
              collectionId: item.collectionId
            }),
            deleteDatasetDataVector({
              teamId: item.teamId,
              datasetIds: [item.datasetId],
              collectionIds: [item.collectionId]
            })
          ]);

          await MongoDatasetData.deleteMany({
            teamId: item.teamId,
            datasetId: item.datasetId,
            collectionId: item.collectionId
          });
        });
      }
    } catch (error) {
      logger.error('Failed to clean invalid dataset data records', { ...item, error });
    }
    if (++index % 100 === 0) {
      logger.debug('Invalid dataset data cleaning progress', {
        processedCollections: index,
        totalCollections: list.length
      });
    }
  }
}

export async function checkInvalidVector(start: Date, end: Date) {
  let deletedVectorAmount = 0;
  // 1. get all vector data
  const rows = await getVectorDataByTime(start, end);
  logger.info('Start cleaning invalid vector records', { totalVectors: rows.length, start, end });

  let index = 0;

  for await (const item of rows) {
    if (!item.teamId || !item.datasetId || !item.id) {
      logger.error('Invalid vector record encountered', { ...item });
      continue;
    }
    try {
      // 2. find dataset.data
      const hasData = await MongoDatasetData.countDocuments({
        teamId: item.teamId,
        datasetId: item.datasetId,
        'indexes.dataId': item.id
      });

      // 3. if not found, delete vector
      if (hasData === 0) {
        await deleteDatasetDataVector({
          teamId: item.teamId,
          id: item.id
        });
        logger.info('Deleted orphan vector record', {
          vectorId: item.id,
          teamId: item.teamId,
          datasetId: item.datasetId
        });
        deletedVectorAmount++;
      }

      index++;
      if (index % 100 === 0) {
        logger.debug('Invalid vector cleaning progress', {
          processedVectors: index,
          totalVectors: rows.length,
          deletedVectorAmount
        });
      }
    } catch (error) {
      logger.error('Failed to clean invalid vector record', { ...item, error });
    }
  }

  logger.info('Finished cleaning invalid vector records', {
    deletedVectorAmount,
    totalVectors: rows.length
  });
}
