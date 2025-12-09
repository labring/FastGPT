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
import { Types } from '@fastgpt/service/common/mongo';
import { countPromptTokens } from '@fastgpt/service/common/string/tiktoken/index';
import { addLog } from '@fastgpt/service/common/system/log';

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

      // 6. 更新全文检索 (使用原始 q/a)
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
    });
  } else {
    // 该条数据无需更新向量,但仍需更新全文检索和删除任务
    await mongoSessionRun(async (session) => {
      const fullText = aStandardized
        ? `${qStandardized.transformedText}\n${aStandardized.transformedText}`
        : qStandardized.transformedText;
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
    });
  }

  return { tokens: totalTokens };
};
