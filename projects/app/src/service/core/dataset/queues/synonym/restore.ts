import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  deleteDatasetDataVector,
  insertDatasetDataVector
} from '@fastgpt/service/common/vectorDB/controller';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba';
import type {
  DatasetDataSchemaType,
  DatasetTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';
import { retryFn } from '@fastgpt/global/common/system/utils';

// Import synonym utilities
import { restoreOriginalText } from '@fastgpt/service/core/dataset/indexTransform/utils';

type TrainingDataType = DatasetTrainingSchemaType & {
  dataset: { vectorModel: string };
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
      model: getEmbeddingModel(trainingData.dataset.vectorModel),
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

    // 5. 更新数据库
    /**
     * 使用 retryFn 处理 WriteConflict 错误
     *
     * 问题场景：
     * 多个 worker 并发处理不同的 training 任务时，在链式处理阶段会同时执行
     * findOneAndUpdate 去抢夺下一条 synonymProcessing='restore' 的数据。
     * MongoDB 事务中的 findOneAndUpdate 是排他的，当多个 session 同时尝试
     * 更新满足相同条件的文档时，只有一个能成功，其他会抛出 WriteConflict。
     *
     * 解决方案：
     * 1. retryFn 重试机制：发生冲突时自动重试，下次可能获取到其他未被锁定的数据
     * 2. 幂等性检查：创建任务前先检查是否已存在，避免重复创建
     *
     * 这个方案与 generateVector.ts 中的 rebuildData 函数以及 standardize.ts 保持一致。
     */
    await retryFn(
      async () => {
        await mongoSessionRun(async (session) => {
          await MongoDatasetData.updateOne(
            { _id: dataId },
            {
              $set: {
                indexes: newIndexes
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

          // 7. 链式处理下一条
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
                    retryCount: 3,
                    billId: trainingData.billId
                  }
                ],
                { session, ordered: true }
              );
            }
          }
        });
      },
      3 // 最多重试3次
    );
  }

  return { tokens: totalTokens };
};
