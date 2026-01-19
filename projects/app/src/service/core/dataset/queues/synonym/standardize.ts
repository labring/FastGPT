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
import { jiebaSplitWithCustomDict } from '@fastgpt/service/common/string/jieba';
import type {
  DatasetDataSchemaType,
  DatasetTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';
import { Types } from '@fastgpt/service/common/mongo';
import { countPromptTokens } from '@fastgpt/service/common/string/tiktoken/index';
import { addLog } from '@fastgpt/service/common/system/log';
import { retryFn } from '@fastgpt/global/common/system/utils';

// Import synonym utilities
import { getDatasetSynonymConfig } from '@fastgpt/service/core/dataset/indexTransform/controller';
import { applySynonymTransform } from '@fastgpt/service/core/dataset/indexTransform/utils';

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

export const processSynonymStandardize = async ({
  trainingData
}: {
  trainingData: TrainingDataType;
}) => {
  if (!trainingData.data) {
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id });
    return { tokens: 0 };
  }

  const { teamId, datasetId, dataId, dataMetadata } = trainingData;
  const synonymFileIds = dataMetadata?.synonymFileIds || [];

  // 1. 获取同义词配置
  const synonymConfig = await getDatasetSynonymConfig({
    teamId: String(teamId),
    datasetId: String(datasetId)
  });

  if (!synonymConfig) {
    // 没有同义词配置,删除任务
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id });
    return { tokens: 0 };
  }

  const { synonymDict, synonymMappingMap } = synonymConfig;

  // 提取所有词汇（标准词 + 同义词），用于 jieba 自定义词典
  const customWords: string[] = [];
  Object.entries(synonymDict).forEach(([standardTerm, synonyms]) => {
    customWords.push(standardTerm); // 标准词
    customWords.push(...synonyms); // 同义词
  });

  // 所有数据都要走增强，不再有跳过选项
  addLog.info('[SynonymStandardize] Processing all data for enhancement', {
    dataId: String(trainingData.dataId)
  });

  // ✅ 获取 embedding 模型的 maxToken 限制
  const embeddingModel = getEmbeddingModel(trainingData.dataset.vectorModel);
  const maxTokenLimit = embeddingModel?.maxToken || 8000;

  // 2. 对 q/a 应用同义词 (仅用于全文检索,不存储)
  const qStandardized = applySynonymTransform(trainingData.data.q, synonymDict, synonymMappingMap);
  const aStandardized = trainingData.data.a
    ? applySynonymTransform(trainingData.data.a, synonymDict, synonymMappingMap)
    : null;

  // 3. 处理每个 index (带token长度检查)
  const indexesToUpdate: Array<{
    index: any;
    indexResult: any;
    arrayIndex: number;
  }> = [];

  for (let i = 0; i < trainingData.data.indexes.length; i++) {
    const index = trainingData.data.indexes[i];

    const indexResult = applySynonymTransform(index.text, synonymDict, synonymMappingMap);

    // ⚠️ 只有当发生了转换时才继续检查
    if (indexResult.transformations.length > 0) {
      // ✅ Token 检查: 如果标准化后的文本超长，跳过该 index 的标准化
      const tokenCount = await countPromptTokens(indexResult.transformedText);

      if (tokenCount > maxTokenLimit) {
        addLog.warn('[SynonymStandardize] Standardized text exceeds maxToken, skipping', {
          dataId: String(trainingData.dataId),
          indexType: index.type,
          originalLength: index.text.length,
          standardizedLength: indexResult.transformedText.length,
          tokenCount,
          maxTokenLimit
        });
        continue; // 跳过该 index，保持原文
      }

      indexesToUpdate.push({ index, indexResult, arrayIndex: i });
    }
  }

  let totalTokens = 0;

  // 判断 q/a 是否发生了同义词转换
  const qaHasTransformation =
    qStandardized.transformations.length > 0 ||
    (aStandardized && aStandardized.transformations.length > 0);

  // 4. 批量更新向量 (先删后插)
  if (indexesToUpdate.length > 0) {
    // 删除旧向量
    const oldDataIds = indexesToUpdate.map((item) => item.index.dataId);
    await deleteDatasetDataVector({
      teamId: String(teamId),
      idList: oldDataIds
    });

    // 插入新向量
    const insertResult = await insertDatasetDataVector({
      inputs: indexesToUpdate.map((item) => item.indexResult.transformedText),
      model: getEmbeddingModel(trainingData.dataset.vectorModel),
      teamId: String(teamId),
      datasetId: String(datasetId),
      collectionId: String(trainingData.collectionId)
    });

    totalTokens = insertResult.tokens;

    // 更新 indexes 数组
    const newIndexes = trainingData.data.indexes.map((index, i) => {
      const updateIndex = indexesToUpdate.findIndex((item) => item.arrayIndex === i);

      if (updateIndex !== -1) {
        const { indexResult } = indexesToUpdate[updateIndex];
        return {
          ...index,
          dataId: insertResult.insertIds[updateIndex], // 新的 dataId
          text: indexResult.transformedText, // 标准化文本
          synonymMetadata: {
            synonymFileIds,
            transformations: indexResult.transformations
          }
        };
      }

      return index;
    });

    // 5. 更新 MongoDB (使用 session 保证原子性)
    /**
     * 使用 retryFn 处理 WriteConflict 错误
     *
     * 问题场景：
     * 多个 worker 并发处理不同的 training 任务时，在链式处理阶段会同时执行
     * findOneAndUpdate 去抢夺下一条 synonymProcessing='standardize' 的数据。
     * MongoDB 事务中的 findOneAndUpdate 是排他的，当多个 session 同时尝试
     * 更新满足相同条件的文档时，只有一个能成功，其他会抛出 WriteConflict。
     *
     * 解决方案：
     * 1. retryFn 重试机制：发生冲突时自动重试，下次可能获取到其他未被锁定的数据
     * 2. 幂等性检查：创建任务前先检查是否已存在，避免重复创建
     *
     * 这个方案与 generateVector.ts 中的 rebuildData 函数保持一致。
     */
    await retryFn(
      async () => {
        await mongoSessionRun(async (session) => {
          await MongoDatasetData.updateOne(
            { _id: dataId },
            {
              $set: {
                // q/a 不修改,保持原文
                indexes: newIndexes
              }
            },
            { session }
          );

          // 6. 如果 q/a 发生了同义词转换，更新全文检索
          if (qaHasTransformation) {
            const fullText =
              trainingData.data.a && aStandardized
                ? `${qStandardized.transformedText}\n${aStandardized.transformedText}`
                : qStandardized.transformedText;
            const fullTextToken = await jiebaSplitWithCustomDict({
              text: fullText,
              customWords: customWords
            });

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
          }

          // 7. 删除训练任务
          await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });

          // 8. 链式处理:查找下一条需要处理的数据
          const nextData = await MongoDatasetData.findOneAndUpdate(
            {
              synonymProcessing: 'standardize',
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
                mode: TrainingModeEnum.synonymStandardize
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
                    mode: TrainingModeEnum.synonymStandardize,
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
  } else {
    /**
     * 使用 retryFn 处理 WriteConflict 错误（同上）
     * indexes 无需更新的分支，但链式处理逻辑相同，存在同样的并发竞争问题
     */
    await retryFn(
      async () => {
        await mongoSessionRun(async (session) => {
          // 如果 q/a 发生了同义词转换，更新全文检索
          if (qaHasTransformation) {
            const fullText =
              trainingData.data.a && aStandardized
                ? `${qStandardized.transformedText}\n${aStandardized.transformedText}`
                : qStandardized.transformedText;
            const fullTextToken = await jiebaSplitWithCustomDict({
              text: fullText,
              customWords: customWords
            });

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
          }

          await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });

          // 链式处理下一条
          const nextData = await MongoDatasetData.findOneAndUpdate(
            {
              synonymProcessing: 'standardize',
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
                mode: TrainingModeEnum.synonymStandardize
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
                    mode: TrainingModeEnum.synonymStandardize,
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
