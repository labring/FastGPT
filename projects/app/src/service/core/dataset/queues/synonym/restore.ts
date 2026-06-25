import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  deleteDatasetDataVector,
  insertDatasetDataVector
} from '@fastgpt/service/common/vectorDB/controller';
import { getEmbeddingModelById } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba';
import type {
  DatasetDataSchemaType,
  DatasetTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { pushCollectionUpdateJob } from '@fastgpt/service/core/dataset/collection/mq';

// Import synonym utilities
import { restoreOriginalText } from '@fastgpt/service/core/dataset/indexTransform/utils';

type TrainingDataType = DatasetTrainingSchemaType & {
  dataset: { vectorModelId: string };
  collection: { name: string };
  data: {
    _id: string;
    q: string;
    a: string;
    indexes: DatasetDataSchemaType['indexes'];
  };
};

export const processSynonymRestore = async ({
  trainingData
}: {
  trainingData: TrainingDataType;
}) => {
  if (!trainingData.data) {
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id });
    return { tokens: 0 };
  }

  const { teamId, datasetId, dataId } = trainingData;

  // 1. q/a 本来就是原文,不需要恢复

  // 2. 收集需要恢复的 index
  const indexesToRestore: Array<{
    index: any;
    originalText: string;
    arrayIndex: number;
  }> = [];

  for (let i = 0; i < trainingData.data.indexes.length; i++) {
    const index = trainingData.data.indexes[i];
    if (index.synonymMetadata) {
      const originalText = restoreOriginalText(index.text, index.synonymMetadata.transformations);
      indexesToRestore.push({ index, originalText, arrayIndex: i });
    }
  }

  let totalTokens = 0;

  // 3. 批量更新向量
  if (indexesToRestore.length > 0) {
    const oldDataIds = indexesToRestore.map((item) => item.index.dataId);
    await deleteDatasetDataVector({
      teamId: String(teamId),
      idList: oldDataIds
    });

    const insertResult = await insertDatasetDataVector({
      inputs: indexesToRestore.map((item) => item.originalText),
      model: getEmbeddingModelById(trainingData.dataset.vectorModelId),
      teamId: String(teamId),
      datasetId: String(datasetId),
      collectionId: String(trainingData.collectionId)
    });

    totalTokens = insertResult.tokens;

    // 4. 更新 indexes
    const newIndexes = trainingData.data.indexes.map((index, i) => {
      const restoreIndex = indexesToRestore.findIndex((item) => item.arrayIndex === i);

      if (restoreIndex !== -1) {
        return {
          type: index.type,
          dataId: insertResult.insertIds[restoreIndex],
          text: indexesToRestore[restoreIndex].originalText
          // 移除 synonymMetadata
        };
      }

      // 未变化的也移除 synonymMetadata
      const { synonymMetadata, ...rest } = index;
      return rest;
    });

    // 5. 更新数据库，不包含链式处理
    await retryFn(
      async () => {
        await mongoSessionRun(async (session) => {
          await MongoDatasetData.updateOne(
            { _id: dataId },
            {
              $set: {
                indexes: newIndexes,
                indexingCompleteTime: new Date(),
                updateTime: new Date()
              }
            },
            { session }
          );

          // 6. 更新全文检索 (使用原文)
          const fullText = trainingData.data.a
            ? `${trainingData.data.q}\n${trainingData.data.a}`
            : trainingData.data.q;
          const fullTextToken = await jiebaSplit({ text: fullText });

          await MongoDatasetDataText.updateOne(
            { dataId },
            {
              $set: {
                teamId,
                datasetId: trainingData.datasetId,
                collectionId: trainingData.collectionId,
                fullTextToken
              }
            },
            { upsert: true, session }
          );

          await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });
        });
      },
      3 // 最多重试3次
    );

    // 更新 collection stats，确保前端状态反映当前处理进度
    pushCollectionUpdateJob(
      {
        collectionId: String(trainingData.collectionId),
        datasetId: String(trainingData.datasetId),
        teamId: String(trainingData.teamId)
      },
      0
    );

    // 7. 链式处理下一条
    // 链式失败不影响当前任务，下一条数据会被后续 Worker 自然拉取到
    try {
      await retryFn(() =>
        mongoSessionRun(async (session) => {
          const nextData = await MongoDatasetData.findOneAndUpdate(
            {
              synonymProcessing: 'restore',
              teamId,
              datasetId: trainingData.datasetId
            },
            {
              $unset: { synonymProcessing: null }
            },
            { session }
          ).select({ _id: 1, collectionId: 1, synonymFileIds: 1 });

          if (nextData) {
            // 幂等性检查：避免重复创建任务
            const existingTask = await MongoDatasetTraining.findOne(
              {
                datasetId: trainingData.datasetId,
                dataId: nextData._id,
                mode: TrainingModeEnum.synonymRestore
              },
              { _id: 1 },
              { session }
            );

            if (!existingTask) {
              await MongoDatasetTraining.create(
                [
                  {
                    teamId,
                    tmbId: trainingData.tmbId,
                    datasetId: trainingData.datasetId,
                    collectionId: nextData.collectionId,
                    mode: TrainingModeEnum.synonymRestore,
                    dataId: nextData._id,
                    dataMetadata: {
                      synonymFileIds: nextData.synonymFileIds
                    },
                    retryCount: 50,
                    billId: trainingData.billId
                  }
                ],
                { session, ordered: true }
              );
            }
          }
        })
      );
    } catch (error) {}
  }

  return { tokens: totalTokens };
};
