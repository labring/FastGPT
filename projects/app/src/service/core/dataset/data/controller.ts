import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  type CreateDatasetDataProps,
  type PatchIndexesProps,
  type UpdateDatasetDataProps
} from '@fastgpt/global/core/dataset/controller';
import { insertDatasetDataVector } from '@fastgpt/service/common/vectorDB/controller';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba/index';
import { deleteDatasetDataVector } from '@fastgpt/service/common/vectorDB/controller';
import {
  type DatasetDataIndexItemType,
  type DatasetDataItemType
} from '@fastgpt/global/core/dataset/type';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { type ClientSession } from '@fastgpt/service/common/mongo';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { countPromptTokens } from '@fastgpt/service/common/string/tiktoken';
import { deleteDatasetImage } from '@fastgpt/service/core/dataset/image/controller';
import { text2Chunks } from '@fastgpt/service/worker/function';
import { getDatasetSynonymConfig } from '@fastgpt/service/core/dataset/indexTransform/controller';
import { applySynonymTransform } from '@fastgpt/service/core/dataset/indexTransform/utils';
import { addLog } from '@fastgpt/service/common/system/log';

const formatIndexes = async ({
  indexes = [],
  q,
  a = '',
  indexSize,
  maxIndexSize,
  indexPrefix,
  synonymDict = {},
  synonymMappingMap = {}
}: {
  indexes?: (Omit<DatasetDataIndexItemType, 'dataId'> & { dataId?: string })[];
  q: string;
  a?: string;
  indexSize: number;
  maxIndexSize: number;
  indexPrefix?: string;
  synonymDict?: Record<string, string[]>;
  synonymMappingMap?: Record<string, string>;
}): Promise<
  {
    type: `${DatasetDataIndexTypeEnum}`;
    text: string;
    dataId?: string;
    synonymTransformations?: any[]; // 添加转换信息字段
  }[]
> => {
  const formatText = (text: string) => {
    if (indexPrefix && !text.startsWith(indexPrefix)) {
      return `${indexPrefix}\n${text}`;
    }
    return text;
  };

  /* get dataset data default index */
  const getDefaultIndex = async ({
    q = '',
    a,
    indexSize
  }: {
    q?: string;
    a?: string;
    indexSize: number;
  }) => {
    // 先切分原始文本
    const qChunks = (
      await text2Chunks({
        text: q, // 使用原始文本切分
        chunkSize: indexSize,
        maxSize: maxIndexSize
      })
    ).chunks;
    const aChunks = a
      ? (await text2Chunks({ text: a, chunkSize: indexSize, maxSize: maxIndexSize })).chunks
      : [];

    // 对每个切分后的片段进行处理
    // 注意：这里暂不进行同义词转换，同义词转换将在添加 prefix 后统一进行
    const processChunk = (chunkText: string) => {
      return {
        text: chunkText, // 保持原始切分文本
        type: DatasetDataIndexTypeEnum.default
      };
    };

    return [...qChunks.map(processChunk), ...aChunks.map(processChunk)];
  };

  // 处理自定义索引（保持原始文本，稍后统一处理）
  indexes = indexes.map((item) => {
    const originalText = typeof item.text === 'string' ? item.text : String(item.text);
    return {
      text: originalText,
      type: item.type || DatasetDataIndexTypeEnum.custom,
      dataId: item.dataId
    };
  });

  // Recompute default indexes, Merge ids of the same index, reduce the number of rebuilds
  const defaultIndexes = await getDefaultIndex({ q, a, indexSize });

  // 将默认索引和自定义索引合并，复用相同文本的 dataId
  //
  // 示例场景：
  // 1. 用户之前创建了自定义索引 "深信服公司介绍" (dataId: "abc123")
  // 2. 现在更新数据，默认索引也生成了 "深信服公司介绍"
  // 3. 为了避免重复向量化，复用旧的 dataId "abc123"
  // 4. 但类型标记为 default（因为现在是默认索引生成的）
  //
  // 注意：此时 defaultIndexes 中还没有 synonymTransformations，
  // 因为同义词转换会在后续添加 prefix 后统一进行
  const concatDefaultIndexes = defaultIndexes.map((item) => {
    const oldIndex = indexes!.find((index) => index.text === item.text);
    if (oldIndex) {
      return {
        type: DatasetDataIndexTypeEnum.default,
        text: item.text,
        dataId: oldIndex.dataId
      };
    } else {
      return item;
    }
  });

  // 其他索引不能与默认索引相同，且不能自己有重复
  indexes = indexes.filter(
    (item, index, self) =>
      item.type !== DatasetDataIndexTypeEnum.default &&
      !concatDefaultIndexes.find((t) => t.text === item.text) &&
      index === self.findIndex((t) => t.text === item.text)
  );
  indexes.push(...concatDefaultIndexes);

  // 检查并处理自定义索引的切分（暂不进行同义词转换）
  const chekcIndexes = (
    await Promise.all(
      indexes.map(async (item) => {
        if (item.type === DatasetDataIndexTypeEnum.default) {
          return item;
        }

        // If oversize tokens, split it first
        const tokens = await countPromptTokens(item.text);
        if (tokens > maxIndexSize) {
          const splitText = (
            await text2Chunks({
              text: item.text, // 使用原始文本进行切分
              chunkSize: indexSize,
              maxSize: maxIndexSize
            })
          ).chunks;

          // 返回切分后的片段，暂不进行同义词转换
          return splitText.map((chunkText) => ({
            text: chunkText,
            type: item.type
          }));
        }

        // 不需要切分的文本，直接返回
        return {
          text: item.text,
          type: item.type,
          dataId: item.dataId
        };
      })
    )
  )
    .flat()
    .filter((item) => !!item.text.trim());

  // 【关键步骤1】先添加 indexPrefix（标准化文本）
  // 【关键步骤2】然后对标准化后的文本进行同义词转换
  //
  // 正确的处理顺序：
  // 1. 切分文本（已完成）
  // 2. 添加 prefix（标准化） ← 当前步骤
  // 3. 同义词转换（作用于标准化后的文本）
  //
  // 示例流程：
  //   原始文本: "我爱深信服"
  //   添加前缀: "问题：\n我爱深信服"
  //   同义词转换: "问题：\n我爱Sangfor" (transformations记录的位置是基于带前缀的文本)
  //
  const prefixedIndexes = indexPrefix
    ? chekcIndexes.map((index) => {
        // custom 类型不添加 prefix
        if (index.type === DatasetDataIndexTypeEnum.custom) return index;

        return {
          ...index,
          text: formatText(index.text) // 添加 prefix
        };
      })
    : chekcIndexes;

  // 【关键步骤2】对标准化后的文本（已添加 prefix）进行同义词转换
  //
  // 示例：
  //   输入: "问题：\n我爱深信服"
  //   输出: "问题：\n我爱Sangfor"
  //   transformations: [{originalText: "深信服", transformedText: "Sangfor", transformedStartPos: 7, transformedEndPos: 13, ...}]
  //
  const transformedIndexes =
    synonymDict && Object.keys(synonymDict).length > 0
      ? prefixedIndexes.map((index) => {
          const transformResult = applySynonymTransform(index.text, synonymDict, synonymMappingMap);

          const result: any = {
            ...index,
            text: transformResult.transformedText
          };

          // 只有在有转换记录时才添加 synonymTransformations
          if (transformResult.transformations.length > 0) {
            result.synonymTransformations = transformResult.transformations;
          }

          return result;
        })
      : prefixedIndexes;

  // 【关键步骤3】标准化后去重
  //
  // 重要：必须在同义词转换后进行去重，因为转换可能导致不同的原始文本变成相同的标准化文本
  //
  // 示例场景：
  //   原始索引1: "我爱深信服" → 标准化后: "问题：\n我爱Sangfor"
  //   原始索引2: "我爱Sangfor" → 标准化后: "问题：\n我爱Sangfor"  ← 重复！
  //
  // 去重策略（优先级从高到低）：
  //   1. 优先保留 default 类型 + 有 dataId 的（从自定义索引继承的 dataId）
  //   2. 其次保留 custom 类型 + 有 dataId 的（原有的自定义索引）
  //   3. 再次保留 default 类型 + 无 dataId 的（新生成的默认索引）
  //   4. 最后保留 custom 类型 + 无 dataId 的（新的自定义索引）
  //
  // 示例：
  //   [
  //     {text: "问题：\nSangfor", type: "custom", dataId: undefined},  // 优先级 4
  //     {text: "问题：\nSangfor", type: "default", dataId: "old123"},  // 优先级 1 ← 保留这个
  //     {text: "问题：\nSangfor", type: "custom", dataId: "old456"},   // 优先级 2
  //   ]
  //
  const finalIndexes = transformedIndexes.filter((item, index, self) => {
    // 找到所有具有相同 text 的索引
    const sameTextIndexes = self
      .map((x, i) => ({ index: i, item: x }))
      .filter((x) => x.item.text === item.text);

    // 如果只有一个，直接保留
    if (sameTextIndexes.length === 1) return true;

    // 如果有多个相同的 text，按优先级选择
    // 优先级：default+dataId > custom+dataId > default+noDataId > custom+noDataId
    const getPriority = (idx: (typeof sameTextIndexes)[0]) => {
      const isDefault = idx.item.type === DatasetDataIndexTypeEnum.default;
      const hasDataId = !!idx.item.dataId;

      if (isDefault && hasDataId) return 1;
      if (!isDefault && hasDataId) return 2;
      if (isDefault && !hasDataId) return 3;
      return 4;
    };

    // 找到优先级最高的（数字最小的）
    let highestPriorityIndex = sameTextIndexes[0];
    let highestPriority = getPriority(highestPriorityIndex);

    for (const idx of sameTextIndexes) {
      const priority = getPriority(idx);
      if (priority < highestPriority) {
        highestPriority = priority;
        highestPriorityIndex = idx;
      }
    }

    return index === highestPriorityIndex.index;
  });

  return finalIndexes;
};
/* insert data.
 * 1. create data id
 * 2. insert pg
 * 3. create mongo data
 */
export async function insertData2Dataset({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  q,
  a,
  imageId,
  chunkIndex = 0,
  indexSize = 512,
  indexes,
  indexPrefix,
  embeddingModel,
  imageDescMap,
  session,
  metadata
}: CreateDatasetDataProps & {
  embeddingModel: string;
  indexSize?: number;
  imageDescMap?: Record<string, string>;
  session?: ClientSession;
}) {
  if (!q || !datasetId || !collectionId || !embeddingModel) {
    return Promise.reject('q, datasetId, collectionId, embeddingModel is required');
  }
  if (String(teamId) === String(tmbId)) {
    return Promise.reject("teamId and tmbId can't be the same");
  }

  const embModel = getEmbeddingModel(embeddingModel);
  indexSize = Math.min(embModel.maxToken, indexSize);

  // ========== Synonym Enhancement (Get Config Only) ==========
  let synonymFileId: string | undefined;
  let synonymDict: Record<string, string[]> = {};
  let synonymMappingMap: Record<string, string> = {};

  try {
    // 获取同义词配置
    const synonymConfig = await getDatasetSynonymConfig({
      teamId: String(teamId),
      datasetId: String(datasetId)
    });

    if (synonymConfig) {
      addLog.info('[Synonym] Found synonym config for dataset', {
        datasetId,
        collectionId,
        synonymFileId: synonymConfig.synonymFileId
      });

      synonymFileId = synonymConfig.synonymFileId;
      synonymDict = synonymConfig.synonymDict;
      synonymMappingMap = synonymConfig.synonymMappingMap;
    }
  } catch (error) {
    // Log error but don't block the indexing process
    addLog.error('[Synonym] Failed to get synonym config', error);
  }

  // 1. Get vector indexes and insert
  // formatIndexes 会负责所有的标准化工作
  // 同时获取标准化后的 q 和 a 用于全文索引
  let normalizedQ = q;
  let normalizedA = a;

  // 如果有同义词配置，对 q 和 a 进行标准化
  if (synonymDict && Object.keys(synonymDict).length > 0) {
    const qResult = applySynonymTransform(q, synonymDict, synonymMappingMap);
    normalizedQ = qResult.transformedText;

    if (a) {
      const aResult = applySynonymTransform(a, synonymDict, synonymMappingMap);
      normalizedA = aResult.transformedText;
    }
  }

  const newIndexes = await formatIndexes({
    indexes, // 原始索引
    q, // 原始 q
    a, // 原始 a
    indexSize,
    maxIndexSize: embModel.maxToken,
    indexPrefix,
    synonymDict, // 传入同义词配置
    synonymMappingMap // 传入映射关系
  });

  // insert to vector store
  const { tokens, insertIds } = await insertDatasetDataVector({
    inputs: newIndexes.map((item) => item.text),
    model: embModel,
    teamId,
    datasetId,
    collectionId
  });

  // 为每个索引构建完整的结果，包括可能的同义词元数据
  const results = newIndexes.map((item, indexPos) => {
    const result: any = {
      type: item.type,
      text: item.text,
      dataId: insertIds[indexPos]
    };

    // 从原始的 normalizedIndexes 或 item 中获取转换信息
    const synonymTransformations = (item as any).synonymTransformations;

    if (synonymTransformations && synonymTransformations.length > 0) {
      result.synonymMetadata = {
        synonymFileIds: synonymFileId ? [synonymFileId] : [], // 添加 synonymFileIds
        transformations: synonymTransformations
      };
    }

    return result;
  });

  // 2. Create mongo data (store normalized q and a)
  const [{ _id }] = await MongoDatasetData.create(
    [
      {
        teamId,
        tmbId,
        datasetId,
        collectionId,
        q: q, // 保持原文不变
        a: a, // 保持原文不变
        imageId,
        imageDescMap,
        chunkIndex,
        indexes: results,
        metadata
        // 注意：对于实时处理的数据，不需要设置 synonymFileIds 和 synonymProcessing
        // 因为 synonymMetadata 已经记录在每个 index 中了
      }
    ],
    { session, ordered: true }
  );

  // 3. Create mongo data text (use standardized text for full-text search)
  await MongoDatasetDataText.create(
    [
      {
        teamId,
        datasetId,
        collectionId,
        dataId: _id,
        fullTextToken: await jiebaSplit({ text: `${normalizedQ}\n${normalizedA || ''}`.trim() })
      }
    ],
    { session, ordered: true }
  );

  return {
    insertId: _id,
    tokens
  };
}

/**
 * Update data(indexes overwrite)
 * 1. compare indexes
 * 2. insert new pg data
 * session run:
 *  3. update mongo data(session run)
 *  4. delete old pg data
 */
export async function updateData2Dataset({
  dataId,
  q = '',
  a,
  indexes,
  model,
  indexSize = 512,
  indexPrefix,
  metadata
}: UpdateDatasetDataProps & { model: string; indexSize?: number }) {
  if (!Array.isArray(indexes)) {
    return Promise.reject('indexes is required');
  }

  // 1. Get mongo data
  const mongoData = await MongoDatasetData.findById(dataId);
  if (!mongoData) return Promise.reject('core.dataset.error.Data not found');

  // ========== Get Synonym Config ==========
  let synonymFileId: string | undefined;
  let synonymDict: Record<string, string[]> = {};
  let synonymMappingMap: Record<string, string> = {};
  let normalizedQ = q;
  let normalizedA = a;

  try {
    const synonymConfig = await getDatasetSynonymConfig({
      teamId: String(mongoData.teamId),
      datasetId: String(mongoData.datasetId)
    });

    if (synonymConfig) {
      addLog.info('[Synonym] Found synonym config for update', {
        dataId,
        collectionId: mongoData.collectionId
      });

      synonymFileId = synonymConfig.synonymFileId;
      synonymDict = synonymConfig.synonymDict;
      synonymMappingMap = synonymConfig.synonymMappingMap;

      // 对 q 和 a 应用同义词标准化
      if (Object.keys(synonymDict).length > 0) {
        const qResult = applySynonymTransform(q, synonymDict, synonymMappingMap);
        normalizedQ = qResult.transformedText;

        if (a !== undefined) {
          const aResult = applySynonymTransform(a, synonymDict, synonymMappingMap);
          normalizedA = aResult.transformedText;
        }
      }
    }
  } catch (error) {
    addLog.error('[Synonym] Failed to get synonym config for update', error);
  }

  // 2. Compute indexes (formatIndexes will handle all standardization)
  const formatIndexesResult = await formatIndexes({
    indexes, // 原始索引
    q, // 原始 q
    a, // 原始 a
    indexSize,
    maxIndexSize: getEmbeddingModel(model).maxToken,
    indexPrefix,
    synonymDict, // 传入同义词配置
    synonymMappingMap // 传入映射关系
  });

  // 3. Patch indexes, create, update, delete
  const patchResult: PatchIndexesProps[] = [];
  // find database indexes in new Indexes, if have not,  delete it
  for (const item of mongoData.indexes) {
    const index = formatIndexesResult.find((index) => index.dataId === item.dataId);
    if (!index) {
      patchResult.push({
        type: 'delete',
        index: item
      });
    }
  }
  for (const item of formatIndexesResult) {
    if (!item.dataId) {
      patchResult.push({
        type: 'create',
        index: item
      });
    } else {
      const index = mongoData.indexes.find((index) => index.dataId === item.dataId);
      if (!index) continue;

      // Not change
      if (index.text === item.text) {
        patchResult.push({
          type: 'unChange',
          index: {
            ...item,
            dataId: index.dataId
          }
        });
      } else {
        // index Update
        patchResult.push({
          type: 'update',
          index: {
            ...item,
            dataId: index.dataId
          }
        });
      }
    }
  }

  const deleteVectorIdList = patchResult
    .filter((item) => item.type === 'delete' || item.type === 'update')
    .map((item) => item.index.dataId)
    .filter(Boolean) as string[];

  // 4. Update mongo updateTime(便于脏数据检查器识别)
  const updateTime = mongoData.updateTime;
  mongoData.updateTime = new Date();
  await mongoData.save();

  // 5. insert vector

  const insertItems = patchResult.filter(
    (item) => item.type === 'create' || item.type === 'update'
  );
  const tokens = await (async () => {
    if (insertItems.length > 0) {
      // Batch insert vectors
      const result = await insertDatasetDataVector({
        inputs: insertItems.map((item) => item.index.text),
        model: getEmbeddingModel(model),
        teamId: mongoData.teamId,
        datasetId: mongoData.datasetId,
        collectionId: mongoData.collectionId
      });

      // Update dataIds for the items
      insertItems.forEach((item, index) => {
        item.index.dataId = result.insertIds[index];
      });

      return result.tokens;
    }
    return 0;
  })();

  const newIndexes = patchResult
    .filter((item) => item.type !== 'delete')
    .map((item) => {
      const index = { ...item.index };

      // 如果有 synonymTransformations 字段，转换为 synonymMetadata
      if ((index as any).synonymTransformations) {
        const transformations = (index as any).synonymTransformations;
        if (transformations.length > 0) {
          (index as any).synonymMetadata = {
            synonymFileIds: synonymFileId ? [synonymFileId] : [], // 添加 synonymFileIds
            transformations: transformations
          };
        }
        delete (index as any).synonymTransformations;
      }

      return index;
    }) as DatasetDataIndexItemType[];

  // 6. update mongo data
  await mongoSessionRun(async (session) => {
    // Update history
    mongoData.history =
      q !== mongoData.q || a !== mongoData.a
        ? [
            {
              q: mongoData.q,
              a: mongoData.a,
              updateTime: updateTime
            },
            ...(mongoData.history?.slice(0, 9) || [])
          ]
        : mongoData.history;
    // 更新q和a字段，保持原文不变
    if (q) mongoData.q = q; // 使用原文
    if (a !== undefined) mongoData.a = a; // 使用原文
    mongoData.indexes = newIndexes;
    mongoData.metadata = metadata ?? mongoData.metadata;
    // 注意：对于实时处理的数据，不需要设置 synonymFileIds 和 synonymProcessing
    // 因为 synonymMetadata 已经记录在每个 index 中了
    await mongoData.save({ session });

    // update mongo data text (use standardized text for full-text search)
    await MongoDatasetDataText.updateOne(
      { dataId: mongoData._id },
      { fullTextToken: await jiebaSplit({ text: `${normalizedQ}\n${normalizedA || ''}`.trim() }) },
      { session }
    );

    // Delete vector
    if (deleteVectorIdList.length > 0) {
      await deleteDatasetDataVector({
        teamId: mongoData.teamId,
        idList: deleteVectorIdList
      });
    }
  });

  return {
    tokens
  };
}

export const deleteDatasetData = async (data: DatasetDataItemType) => {
  await mongoSessionRun(async (session) => {
    // 1. Delete MongoDB data
    await MongoDatasetData.deleteOne({ _id: data.id }, { session });
    await MongoDatasetDataText.deleteMany({ dataId: data.id }, { session });

    // 2. If there are any image files, delete the image records and GridFS file.
    if (data.imageId) {
      await deleteDatasetImage(data.imageId);
    }

    // 3. Delete vector data
    await deleteDatasetDataVector({
      teamId: data.teamId,
      idList: data.indexes.map((item) => item.dataId)
    });
  });
};
