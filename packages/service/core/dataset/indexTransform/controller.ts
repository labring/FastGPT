import { MongoDatasetSynonymMapping } from '../synonym/mappingSchema';
import { MongoDatasetSynonym } from '../synonym/schema';
import { Types } from '../../../common/mongo';
import { buildSynonymDict, applySynonymTransform } from './utils';
import type {
  DatasetSynonymMappingSchemaType,
  DatasetDataIndexItemType
} from '@fastgpt/global/core/dataset/type';

/**
 * 获取知识库的所有同义词映射
 *
 * @param params - 查询参数
 * @returns 同义词映射数组
 *
 * @example
 * const mappings = await getDatasetSynonymMappings({
 *   teamId: 'team-123',
 *   datasetId: 'dataset-456'
 * });
 */
export async function getDatasetSynonymMappings({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<DatasetSynonymMappingSchemaType[]> {
  return await MongoDatasetSynonymMapping.find({
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  })
    .select('_id standardizedTerm synonymTerms')
    .lean();
}

/**
 * 根据同义词文件ID获取映射
 *
 * @param params - 查询参数
 * @returns 同义词映射数组
 *
 * @example
 * const mappings = await getSynonymMappingsByFileId({
 *   fileId: 'file-123'
 * });
 */
export async function getSynonymMappingsByFileId({
  fileId
}: {
  fileId: string;
}): Promise<DatasetSynonymMappingSchemaType[]> {
  return await MongoDatasetSynonymMapping.find({
    synonymFileId: new Types.ObjectId(fileId)
  })
    .select('_id standardizedTerm synonymTerms')
    .lean();
}

/**
 * 检查知识库是否有同义词配置
 *
 * @param params - 查询参数
 * @returns 是否有同义词
 *
 * @example
 * const hasSynonym = await hasDatasetSynonym({
 *   teamId: 'team-123',
 *   datasetId: 'dataset-456'
 * });
 */
export async function hasDatasetSynonym({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<boolean> {
  const count = await MongoDatasetSynonym.countDocuments({
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  });
  return count > 0;
}

/**
 * 统计知识库的同义词映射数量
 *
 * @param params - 查询参数
 * @returns 映射数量
 *
 * @example
 * const count = await countDatasetSynonymMappings({
 *   teamId: 'team-123',
 *   datasetId: 'dataset-456'
 * });
 */
export async function countDatasetSynonymMappings({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<number> {
  return await MongoDatasetSynonymMapping.countDocuments({
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  });
}

/**
 * 批量获取多个知识库的同义词转换配置
 *
 * @param params - 查询参数
 * @returns { [datasetId]: config } 映射，无配置的知识库不包含在内
 *
 * @example
 * const configs = await getBatchDatasetSynonymConfig({
 *   teamId: 'team-123',
 *   datasetIds: ['dataset-1', 'dataset-2']
 * });
 */
export async function getBatchDatasetSynonymConfig({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}): Promise<
  Record<
    string,
    {
      synonymDict: Record<string, string[]>;
      synonymMappingMap: Record<string, string>;
      synonymFileId: string;
    }
  >
> {
  const result: Record<
    string,
    {
      synonymDict: Record<string, string[]>;
      synonymMappingMap: Record<string, string>;
      synonymFileId: string;
    }
  > = {};

  // 1. 批量检查同义词文件
  const synonymFiles = await MongoDatasetSynonym.find({
    teamId: new Types.ObjectId(teamId),
    datasetId: { $in: datasetIds.map((id) => new Types.ObjectId(id)) }
  })
    .select('_id datasetId')
    .lean();

  if (synonymFiles.length === 0) {
    return result;
  }

  // 2. 批量获取所有映射
  const mappings = await MongoDatasetSynonymMapping.find({
    teamId: new Types.ObjectId(teamId),
    datasetId: { $in: datasetIds.map((id) => new Types.ObjectId(id)) }
  })
    .select('_id datasetId standardizedTerm synonymTerms')
    .lean();

  // 3. 按 datasetId 分组
  const mappingsByDataset: Record<string, DatasetSynonymMappingSchemaType[]> = {};
  for (const mapping of mappings) {
    const datasetId = String(mapping.datasetId);
    if (!mappingsByDataset[datasetId]) {
      mappingsByDataset[datasetId] = [];
    }
    mappingsByDataset[datasetId].push(mapping);
  }

  // 4. 为每个知识库构建配置
  for (const file of synonymFiles) {
    const datasetId = String(file.datasetId);
    const datasetMappings = mappingsByDataset[datasetId];

    if (!datasetMappings || datasetMappings.length === 0) {
      continue;
    }

    const formattedMappings = datasetMappings.map((mapping) => ({
      _id: String(mapping._id),
      standardizedTerm: mapping.standardizedTerm,
      synonymTerms: mapping.synonymTerms
    }));

    const { synonymDict, synonymMappingMap } = buildSynonymDict(formattedMappings);

    result[datasetId] = {
      synonymDict,
      synonymMappingMap,
      synonymFileId: String(file._id)
    };
  }

  return result;
}

/**
 * 获取知识库的同义词转换配置
 * 直接返回用于 applySynonymTransform 的字典和映射表
 *
 * @param params - 查询参数
 * @returns { synonymDict, synonymMappingMap, synonymFileId } 或 null（无同义词配置）
 *
 * @example
 * const config = await getDatasetSynonymConfig({
 *   teamId: 'team-123',
 *   datasetId: 'dataset-456'
 * });
 *
 * if (config) {
 *   const { synonymDict, synonymMappingMap } = config;
 *   const { transformedText, transformations } = applySynonymTransform(
 *     originalText,
 *     synonymDict,
 *     synonymMappingMap
 *   );
 * }
 */
export async function getDatasetSynonymConfig({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<{
  synonymDict: Record<string, string[]>;
  synonymMappingMap: Record<string, string>;
  synonymFileId: string;
} | null> {
  // 1. 检查该知识库是否有同义词文件
  const synonymFile = await MongoDatasetSynonym.findOne({
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  })
    .select('_id')
    .lean();

  if (!synonymFile) {
    return null; // 没有同义词文件
  }

  // 2. 获取所有同义词映射
  const mappings = await MongoDatasetSynonymMapping.find({
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  })
    .select('_id standardizedTerm synonymTerms')
    .lean();

  if (mappings.length === 0) {
    return null; // 没有映射数据
  }

  // 3. 转换格式并构建字典和映射表
  const formattedMappings = mappings.map((mapping) => ({
    _id: String(mapping._id),
    standardizedTerm: mapping.standardizedTerm,
    synonymTerms: mapping.synonymTerms
  }));

  const { synonymDict, synonymMappingMap } = buildSynonymDict(formattedMappings);

  return {
    synonymDict,
    synonymMappingMap,
    synonymFileId: String(synonymFile._id)
  };
}

/**
 * 实时同义词标准化 (用于新增数据)
 * 在训练队列中调用,对新增数据进行实时标准化
 *
 * @param params - 标准化参数
 * @returns 标准化后的数据,包含原文q/a和标准化后的索引
 *
 * @example
 * const result = await realtimeSynonymStandardize({
 *   teamId: 'team-123',
 *   datasetId: 'dataset-456',
 *   q: '如何退费?',
 *   a: '请联系客服办理退费',
 *   indexes: [{ type: 'chunk', text: '如何退费?请联系客服办理退费' }],
 *   isUserCustom: false
 * });
 * // result.q => '如何退费?' (原文不变)
 * // result.qStandardized => '如何退款?' (标准化后,用于全文检索)
 * // result.indexes[0].text => '如何退款?请联系客服办理退款' (标准化后,用于向量化)
 */
export async function realtimeSynonymStandardize({
  teamId,
  datasetId,
  q,
  a,
  indexes
}: {
  teamId: string;
  datasetId: string;
  q: string;
  a?: string;
  indexes: Omit<DatasetDataIndexItemType, 'dataId'>[];
}): Promise<{
  q: string;
  a?: string;
  qStandardized: string;
  aStandardized?: string;
  indexes: Omit<DatasetDataIndexItemType, 'dataId'>[];
}> {
  // 1. 获取同义词配置
  const synonymConfig = await getDatasetSynonymConfig({ teamId, datasetId });

  if (!synonymConfig) {
    return { q, a, qStandardized: q, aStandardized: a, indexes };
  }

  const { synonymDict, synonymMappingMap, synonymFileId } = synonymConfig;

  // 2. 标准化 q/a (用于全文检索)
  const qResult = applySynonymTransform(q, synonymDict, synonymMappingMap);
  const aResult = a ? applySynonymTransform(a, synonymDict, synonymMappingMap) : null;

  // 4. 标准化 indexes - 所有索引都要走增强
  const newIndexes = indexes.map((index) => {
    const indexResult = applySynonymTransform(index.text, synonymDict, synonymMappingMap);
    return {
      ...index,
      text: indexResult.transformedText,
      ...(indexResult.transformations.length > 0 && {
        synonymMetadata: {
          synonymFileIds: [synonymFileId],
          transformations: indexResult.transformations
        }
      })
    };
  });

  return {
    q, // 原文不变,存储到 MongoDB
    a, // 原文不变,存储到 MongoDB
    qStandardized: qResult.transformedText, // 标准化后,用于全文检索
    aStandardized: aResult?.transformedText || a, // 标准化后,用于全文检索
    indexes: newIndexes
  };
}
