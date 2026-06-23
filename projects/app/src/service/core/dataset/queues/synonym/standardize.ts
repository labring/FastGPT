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
import { jiebaSplitWithCustomDict } from '@fastgpt/service/common/string/jieba';
import type {
  DatasetDataSchemaType,
  DatasetTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';
import { Types } from '@fastgpt/service/common/mongo';
import { countPromptTokens } from '@fastgpt/service/common/string/tiktoken/index';
import { addLog } from '@fastgpt/service/common/system/log';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { pushCollectionUpdateJob } from '@fastgpt/service/core/dataset/collection/mq';

// Import synonym utilities
import { getDatasetSynonymConfig } from '@fastgpt/service/core/dataset/indexTransform/controller';
import {
  applySynonymTransform,
  restoreOriginalText
} from '@fastgpt/service/core/dataset/indexTransform/utils';

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

/**
 * 对比两次同义词标准化结果是否一致
 * 只对比转换的语义等价性（原始词→标准词的映射关系），不对比 synonymFileIds 和位置信息
 */
function compareSynonymResult(
  historyMeta: { synonymFileIds: string[]; transformations: any[] } | undefined,
  currentResult: { transformations: any[] }
): boolean {
  // 无历史数据，视为不一致（需要更新）
  if (!historyMeta) {
    return false;
  }

  // 对比转换记录数量
  const historyTransforms = historyMeta.transformations || [];
  const currentTransforms = currentResult.transformations || [];
  if (historyTransforms.length !== currentTransforms.length) {
    return false;
  }

  // 如果都没有转换，视为一致
  if (historyTransforms.length === 0 && currentTransforms.length === 0) {
    return true;
  }

  // 对比每个转换的语义等价性
  for (let i = 0; i < historyTransforms.length; i++) {
    const h = historyTransforms[i];
    const c = currentTransforms[i];

    // 核心：原始词 -> 标准词的映射关系是否相同
    if (h.originalTerm !== c.originalTerm) return false;
    if (h.standardizedTerm !== c.standardizedTerm) return false;

    // 不对比位置信息（恢复原文后重新标准化，位置可能变化）
    // 不对比 synonymMappingId（文件ID可能变化但映射关系相同）
  }

  return true;
}

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
  const embeddingModel = getEmbeddingModelById(trainingData.dataset.vectorModelId);
  const maxTokenLimit = embeddingModel?.maxToken || 8000;

  // 2. 对 q/a 应用同义词 (仅用于全文检索,不存储)
  const qStandardized = applySynonymTransform(trainingData.data.q, synonymDict, synonymMappingMap);
  const aStandardized = trainingData.data.a
    ? applySynonymTransform(trainingData.data.a, synonymDict, synonymMappingMap)
    : null;

  // 3. 【关键逻辑】处理每个 index（带增量对比）
  const indexesToUpdate: Array<{
    index: any;
    indexResult: any;
    arrayIndex: number;
    clearMetadata?: boolean;
  }> = [];
  const indexesToUpdateFileIdOnly: Array<{
    index: any;
    arrayIndex: number;
    newSynonymMetadata: any;
  }> = [];

  for (let i = 0; i < trainingData.data.indexes.length; i++) {
    const index = trainingData.data.indexes[i];

    // 【增量对比】如果该 index 已有同义词元数据，先恢复原文
    let originalText: string;
    if (index.synonymMetadata?.transformations) {
      originalText = restoreOriginalText(index.text, index.synonymMetadata.transformations);
    } else {
      originalText = index.text;
    }

    // 用新的同义词配置进行标准化
    const indexResult = applySynonymTransform(originalText, synonymDict, synonymMappingMap);

    // 【增量对比】对比历史结果与当前结果（只对比转换语义，不对比 fileId）
    const isSameTransform = compareSynonymResult(index.synonymMetadata, {
      transformations: indexResult.transformations
    });

    if (isSameTransform) {
      // 转换内容一致，检查 fileId 是否需要更新
      const historyFileIds = index.synonymMetadata?.synonymFileIds?.sort() || [];
      const currentFileIds = [...synonymFileIds].sort();
      const isSameFileId =
        historyFileIds.length === currentFileIds.length &&
        historyFileIds.every((id: string, idx: number) => id === currentFileIds[idx]);

      if (!isSameFileId && index.synonymMetadata) {
        // 转换内容一致，但 fileId 不同，只更新元数据中的 fileId
        indexesToUpdateFileIdOnly.push({
          index,
          arrayIndex: i,
          newSynonymMetadata: {
            synonymFileIds,
            transformations: index.synonymMetadata.transformations // 保留原转换记录
          }
        });
      }
      // 如果 fileId 也相同，完全无变化，跳过
      continue;
    }

    // 转换内容不一致，需要更新向量 + 更新元数据
    if (indexResult.transformations.length > 0) {
      // 【场景1/3/7/8】有新转换，检查 token 长度
      const tokenCount = await countPromptTokens(indexResult.transformedText);

      if (tokenCount > maxTokenLimit) {
        addLog.warn('[SynonymStandardize] Standardized text exceeds maxToken, skipping', {
          dataId: String(trainingData.dataId),
          indexType: index.type,
          originalLength: originalText.length,
          standardizedLength: indexResult.transformedText.length,
          tokenCount,
          maxTokenLimit
        });
        continue; // 跳过该 index，保持原文
      }

      indexesToUpdate.push({ index, indexResult, arrayIndex: i });
    } else if (index.synonymMetadata) {
      // 【场景5】历史有转换记录，但新规则未命中
      // 需要清空 synonymMetadata，用原文重建向量
      indexesToUpdate.push({
        index,
        indexResult: { transformedText: originalText, transformations: [] },
        arrayIndex: i,
        clearMetadata: true // 标记需要移除 synonymMetadata
      });
    }
    // 【场景2】无历史元数据且新规则未命中 → 跳过，不处理
  }

  let totalTokens = 0;

  // 判断 q/a 是否发生了同义词转换
  const qaHasTransformation =
    qStandardized.transformations.length > 0 ||
    (aStandardized && aStandardized.transformations.length > 0);

  // 4. 批量更新向量（先删后插）—— 只有转换内容变化时才需要
  let insertResult: { insertIds: string[]; tokens: number } | null = null;
  if (indexesToUpdate.length > 0) {
    // 删除旧向量
    const oldDataIds = indexesToUpdate.map((item) => item.index.dataId);
    await deleteDatasetDataVector({
      teamId: String(teamId),
      idList: oldDataIds
    });

    // 插入新向量
    insertResult = await insertDatasetDataVector({
      inputs: indexesToUpdate.map((item) => item.indexResult.transformedText),
      model: getEmbeddingModelById(trainingData.dataset.vectorModelId),
      teamId: String(teamId),
      datasetId: String(datasetId),
      collectionId: String(trainingData.collectionId)
    });

    totalTokens = insertResult.tokens;
  }

  // 5. 构建新的 indexes 数组（两种情况都需要更新 MongoDB）
  const hasAnyUpdate = indexesToUpdate.length > 0 || indexesToUpdateFileIdOnly.length > 0;

  if (hasAnyUpdate) {
    // 更新 indexes 数组
    const newIndexes = trainingData.data.indexes.map((index, i) => {
      // 情况1：转换内容变化，更新向量 + 更新元数据
      const updateIndex = indexesToUpdate.findIndex((item) => item.arrayIndex === i);
      if (updateIndex !== -1 && insertResult) {
        const { indexResult, clearMetadata } = indexesToUpdate[updateIndex];

        if (clearMetadata) {
          // 【场景5】新规则未命中，清空 synonymMetadata，用原文
          const { synonymMetadata, ...rest } = index;
          return {
            ...rest,
            dataId: insertResult.insertIds[updateIndex],
            text: indexResult.transformedText // 原文
            // 不设置 synonymMetadata，即移除该字段
          };
        }

        return {
          ...index,
          dataId: insertResult.insertIds[updateIndex],
          text: indexResult.transformedText,
          synonymMetadata: {
            synonymFileIds,
            transformations: indexResult.transformations
          }
        };
      }

      // 情况2：转换内容一致但 fileId 变化，只更新元数据中的 fileId
      const fileIdOnlyIndex = indexesToUpdateFileIdOnly.findIndex((item) => item.arrayIndex === i);
      if (fileIdOnlyIndex !== -1) {
        const { newSynonymMetadata } = indexesToUpdateFileIdOnly[fileIdOnlyIndex];
        return {
          ...index,
          synonymMetadata: newSynonymMetadata
        };
      }

      return index;
    });

    // 5. 更新 MongoDB (使用 session 保证原子性)，不包含链式处理
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

          // 7. 如果 q/a 发生了同义词转换，更新全文检索
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

          // 8. 删除训练任务
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

    // 8. 链式处理:查找下一条需要处理的数据
    // 链式失败不影响当前任务，下一条数据会被后续 Worker 自然拉取到
    try {
      await retryFn(() =>
        mongoSessionRun(async (session) => {
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
  } else {
    // indexes 无需更新的分支，不包含链式处理
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

    // 链式处理下一条
    // 链式失败不影响当前任务，下一条数据会被后续 Worker 自然拉取到
    try {
      await retryFn(() =>
        mongoSessionRun(async (session) => {
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
