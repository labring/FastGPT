import type { SynonymMappingForPrompt } from '@fastgpt/global/core/ai/type';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetSynonymMapping } from '../synonym/mappingSchema';
import { addLog } from '../../../common/system/log';

/**
 * 从 chunk 的所有 default index 的 synonymMetadata.transformations 中提取同义词映射。
 * 直接读内存中已有的转换记录，无需额外数据库查询。
 * @param data 数据集数据项
 * @param chunkId chunk的ID（暂未使用，保留供日志追踪）
 * @returns 同义词映射列表（仅包含该 chunk 实际发生过替换的词对）
 */
export const extractChunkSynonyms = (
  data: DatasetDataSchemaType,
  chunkId: string
): SynonymMappingForPrompt[] => {
  // 取所有 default 类型的 index（一个 chunk 可能有多个 default index，如 q 和 a 各一个）
  const defaultIndexes =
    data.indexes?.filter((idx) => idx.type === DatasetDataIndexTypeEnum.default) ?? [];
  addLog.debug('extractChunkSynonyms - defaultIndexes count:', { count: defaultIndexes.length });

  // 收集所有 default index 的 transformations
  const allTransformations = defaultIndexes.flatMap(
    (idx) => idx.synonymMetadata?.transformations ?? []
  );

  if (allTransformations.length === 0) {
    addLog.debug('extractChunkSynonyms - No transformations found');
    return [];
  }
  addLog.debug('extractChunkSynonyms - allTransformations', { allTransformations });

  // 按 standardizedTerm 分组，将同一标准词的多个 originalTerm 合并为 synonymTerms
  const termMap = new Map<string, Set<string>>();
  for (const t of allTransformations) {
    if (!t.standardizedTerm || !t.originalTerm) continue;
    if (!termMap.has(t.standardizedTerm)) {
      termMap.set(t.standardizedTerm, new Set());
    }
    termMap.get(t.standardizedTerm)!.add(t.originalTerm);
  }

  const synonymMappings: SynonymMappingForPrompt[] = [];
  termMap.forEach((synonymSet, standardizedTerm) => {
    synonymMappings.push({
      standardizedTerm,
      synonymTerms: Array.from(synonymSet),
      source: 'chunk',
      chunkId
    });
  });

  addLog.debug('extractChunkSynonyms - Final synonymMappings', { synonymMappings });
  return synonymMappings;
};

/**
 * 从query中提取同义词映射
 * @param query 查询文本
 * @param datasetIds 数据集ID列表
 * @returns 同义词映射列表
 */
export const extractQuerySynonyms = async (
  query: string,
  datasetIds: string[]
): Promise<SynonymMappingForPrompt[]> => {
  const synonymMappings: SynonymMappingForPrompt[] = [];

  if (!query || datasetIds.length === 0) {
    return synonymMappings;
  }

  try {
    // 查询所有相关的同义词映射
    const mappings = await MongoDatasetSynonymMapping.find(
      {
        datasetId: { $in: datasetIds }
      },
      'standardizedTerm synonymTerms'
    )
      .lean()
      .limit(100);

    // 检查query中是否包含标准词或同义词
    mappings.forEach((mapping) => {
      const allTerms = [mapping.standardizedTerm, ...(mapping.synonymTerms || [])];

      // 检查query中是否包含任何一个词
      const isMatched = allTerms.some((term) => query.includes(term));

      if (isMatched && mapping.synonymTerms && mapping.synonymTerms.length > 0) {
        synonymMappings.push({
          standardizedTerm: mapping.standardizedTerm,
          synonymTerms: mapping.synonymTerms,
          source: 'query'
        });
      }
    });
  } catch (error) {
    addLog.debug('Error extracting query synonyms', { error });
  }

  return synonymMappings;
};

/**
 * 合并并去重同义词映射
 * @param mappings 同义词映射列表
 * @returns 合并后的同义词映射列表
 */
export const mergeSynonymMappings = (
  mappings: SynonymMappingForPrompt[]
): SynonymMappingForPrompt[] => {
  if (!mappings || mappings.length === 0) {
    return [];
  }

  const mergedMap = new Map<
    string,
    { synonymSet: Set<string>; source: 'query' | 'chunk'; chunkId?: string }
  >();

  // 第一次遍历：收集所有同义词并记录source信息
  mappings.forEach((item) => {
    const key = item.standardizedTerm;
    if (!mergedMap.has(key)) {
      mergedMap.set(key, {
        synonymSet: new Set(),
        source: item.source,
        chunkId: item.chunkId
      });
    }

    const entry = mergedMap.get(key)!;
    item.synonymTerms.forEach((syn) => entry.synonymSet.add(syn));

    // 如果有chunk来源，优先使用chunk来源
    if (item.source === 'chunk') {
      entry.source = 'chunk';
      entry.chunkId = item.chunkId;
    }
  });

  // 转换回数组格式
  const result: SynonymMappingForPrompt[] = [];
  mergedMap.forEach((entry, standardizedTerm) => {
    result.push({
      standardizedTerm,
      synonymTerms: Array.from(entry.synonymSet),
      source: entry.source,
      chunkId: entry.chunkId
    });
  });

  return result;
};

/**
 * 生成同义词映射的提示文本
 * @param synonymMappings 同义词映射列表
 * @returns 格式化的提示文本
 */
export const buildSynonymMappingPrompt = (synonymMappings: SynonymMappingForPrompt[]): string => {
  if (!synonymMappings || synonymMappings.length === 0) {
    return '';
  }

  const mappingLines = synonymMappings.map((item) => {
    const synonymStr = item.synonymTerms.join('、');
    // const sourceLabel = item.source === 'query' ? '[查询词]' : '[知识库]';
    // return `- "${item.standardizedTerm}" 的同义词: ${synonymStr} ${sourceLabel}`;
    // return `- "${item.standardizedTerm}" 的同义词: ${synonymStr} ${sourceLabel}`;
    return `- "${item.standardizedTerm}" synonyms: ${synonymStr}`;
  });

  return mappingLines.join('\n');
};

/**
 * 生成同义词映射的JSON格式
 * @param synonymMappings 同义词映射列表
 * @returns JSON字符串
 */
export const buildSynonymMappingJSON = (synonymMappings: SynonymMappingForPrompt[]): string => {
  if (!synonymMappings || synonymMappings.length === 0) {
    return '[]';
  }

  return JSON.stringify(
    synonymMappings.map((item) => ({
      standardizedTerm: item.standardizedTerm,
      synonymTerms: item.synonymTerms,
      source: item.source
    })),
    null,
    2
  );
};
