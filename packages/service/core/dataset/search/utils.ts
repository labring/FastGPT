import { queryExtension } from '../../ai/functions/queryExtension';
import { type ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { getLogger, LogCategories } from '../../../common/logger';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import { getImageBase64 } from '../../../common/file/image/utils';
import { serviceEnv } from '../../../env';
import { isS3ObjectKey } from '../../../common/s3/utils';
import { getS3DatasetSource } from '../../../common/s3/sources/dataset';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import { getDatasetSynonymRuntimeConfig, isDatasetSynonymEnabled } from '../synonym/entity';
import {
  buildSynonymMatcher,
  normalizeSynonymTerm,
  type DatasetSynonymMatcherMapping
} from '../synonym/utils';
import type { DatasetSynonymMappingMetadataType } from '@fastgpt/global/core/dataset/synonym';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);
const maxSynonymQueryCodePoints = 4096;

type DatasetSynonymQueryMatch = DatasetSynonymMappingMetadataType & {
  preserveOriginal: boolean;
  order: number;
};

/**
 * 合并多个知识库/版本对同一 query 的命中。同一 term 只有一个标准词时直接替换；
 * 标准词冲突或跨知识库搜索时保留原词并稳定追加全部标准词。
 */
export const mergeDatasetSynonymQueryMatches = ({
  query,
  matches
}: {
  query: string;
  matches: DatasetSynonymQueryMatch[];
}) => {
  const termMap = new Map<
    string,
    {
      matchedTerm: string;
      standards: Array<{ term: string; order: number }>;
      preserveOriginal: boolean;
    }
  >();

  for (const match of matches) {
    const key = normalizeSynonymTerm(match.matchedTerm);
    const item = termMap.get(key) ?? {
      matchedTerm: match.matchedTerm,
      standards: [],
      preserveOriginal: false
    };
    if (
      !item.standards.some(
        ({ term }) => normalizeSynonymTerm(term) === normalizeSynonymTerm(match.standardizedTerm)
      )
    ) {
      item.standards.push({ term: match.standardizedTerm, order: match.order });
    }
    item.preserveOriginal ||= match.preserveOriginal;
    termMap.set(key, item);
  }

  const mappings: DatasetSynonymMatcherMapping[] = [...termMap.entries()].map(
    ([normalizedTerm, item], index) => {
      item.standards.sort((a, b) => a.order - b.order || a.term.localeCompare(b.term));
      const standardTerms = item.standards.map(({ term }) => term);
      const preserveOriginal = item.preserveOriginal || standardTerms.length > 1;
      return {
        logicalMappingId: `query-${index}`,
        datasetId: 'query',
        fileVersion: 0,
        standardizedTerm: [preserveOriginal ? item.matchedTerm : '', ...standardTerms]
          .filter(Boolean)
          .join(' '),
        normalizedStandardizedTerm: `__synonym_query_expansion_${index}__`,
        synonymTerms: [item.matchedTerm],
        normalizedSynonymTerms: [normalizedTerm]
      };
    }
  );
  if (mappings.length === 0) return query;

  const transformed = buildSynonymMatcher(mappings).transform(query).transformedText;
  if (Array.from(transformed).length <= maxSynonymQueryCodePoints) return transformed;

  logger.warn('Dataset synonym query expansion exceeded limit', {
    originalLength: Array.from(query).length,
    transformedLength: Array.from(transformed).length,
    limit: maxSynonymQueryCodePoints
  });
  return query;
};

/** 依次按 datasetIds 和当前生效版本收集命中，保持冲突扩展顺序稳定。 */
export const standardizeDatasetSearchQueries = async ({
  teamId,
  datasetIds,
  queries
}: {
  teamId: string;
  datasetIds: string[];
  queries: string[];
}) => {
  if (!isDatasetSynonymEnabled()) return queries;

  const runtimeConfigs = await Promise.all(
    datasetIds.map((datasetId) => getDatasetSynonymRuntimeConfig({ teamId, datasetId }))
  );

  return queries.map((query) => {
    const matches: DatasetSynonymQueryMatch[] = [];
    runtimeConfigs.forEach((runtime, datasetOrder) => {
      if (!runtime) return;
      // 规则切换后历史向量最终一致，始终保留原词可覆盖新旧 embedding 混合阶段。
      const preserveOriginal = true;
      const versions = [runtime.active].filter(Boolean) as NonNullable<typeof runtime.active>[];
      versions.forEach((version, versionOrder) => {
        version.matcher.transform(query).usedMappings.forEach((mapping) => {
          matches.push({
            ...mapping,
            preserveOriginal,
            order: datasetOrder * 2 + versionOrder
          });
        });
      });
    });
    return mergeDatasetSynonymQueryMatches({ query, matches });
  });
};

/**
 * 计算多个 collection 过滤条件的交集。
 * `undefined` 表示当前过滤维度未启用，应被忽略；空数组表示该维度明确无命中，
 * 会参与交集并让最终结果为空。
 */
export const computeFilterIntersection = (lists: (string[] | undefined)[]) => {
  const validLists = lists.filter((list): list is string[] => list !== undefined);

  if (validLists.length === 0) return undefined;

  // reduce without initial value uses first element as accumulator
  return validLists.reduce((acc, list) => {
    const set = new Set(list);
    return acc.filter((id) => set.has(id));
  });
};

export const isValidImageEmbeddingSource = (imageUrl?: string) => {
  const url = imageUrl?.trim();
  if (!url) return false;

  if (url.startsWith('data:image/')) return true;
  if (isS3ObjectKey(url, 'dataset')) return true;
  if (isS3ObjectKey(url, 'temp')) return true;
  if (isS3ObjectKey(url, 'chat')) return true;
  if (/^https?:\/\//i.test(url)) return true;

  return false;
};

/**
 * 按环境开关规范化图片输入。
 * data URL 已经是模型可读内容，始终原样返回；普通图片 URL 只有
 * serviceEnv.MULTIPLE_DATA_TO_BASE64 为 true 时才转成 base64。
 * FastGPT 内部对象 key 的鉴权和临时 URL 生成应在入口层完成，避免通用规范化函数
 * 混入业务权限和存储来源判断。
 * 这里不吞异常，由上层按图片粒度降级，避免一张坏图中断整次检索。
 */
export const normalizeImageToBase64 = async (imageUrl: string) => {
  if (imageUrl.startsWith('data:image/')) {
    return imageUrl;
  }

  if (!serviceEnv.MULTIPLE_DATA_TO_BASE64) {
    return imageUrl;
  }

  const { completeBase64 } = await getImageBase64(imageUrl);
  return completeBase64;
};

export const isImageEmbeddingIndex = (index: { type?: string | number }) =>
  index.type === DatasetDataIndexTypeEnum.imageEmbedding;

export const normalizeDatasetIndexImageToModelInput = async (imageUrl: string) => {
  if (
    isS3ObjectKey(imageUrl, 'dataset') ||
    isS3ObjectKey(imageUrl, 'temp') ||
    isS3ObjectKey(imageUrl, 'chat')
  ) {
    return getS3DatasetSource().getDatasetBase64Image(imageUrl);
  }

  return normalizeImageToBase64(imageUrl);
};

/**
 * 对文本查询做 query extension。
 * 调用方会先把多个文本 query 合并成一个字符串传入，这里始终按普通字符串处理，
 * 不再兼容旧的“query 已经是扩展结果 JSON”分支。扩展失败时返回原始 query，
 * 保证搜索主链路不被 LLM 扩展能力影响。
 */
export const datasetSearchQueryExtension = async ({
  query,
  llmModel,
  embeddingModel,
  userKey,
  teamId,
  extensionBg = '',
  histories = [],
  datasetIds = []
}: {
  query: string;
  llmModel?: LLMSystemModelDataType;
  embeddingModel?: EmbeddingSystemModelDataType;
  userKey?: OpenaiAccountType;
  teamId: string;
  extensionBg?: string;
  histories?: ChatItemMiniType[];
  datasetIds?: string[];
}) => {
  /**
   * query extension 结果可能与原 query 只有标点或空格差异。
   * 去重时忽略标点和空白，但保留原始文本，避免影响后续 embedding 和展示。
   */
  const filterSameQuery = (queries: string[]) => {
    const set = new Set<string>();
    const filterSameQueries = queries
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => {
        // 删除所有的标点符号与空格等，只对文本进行比较
        const str = hashStr(item.replace(/[^\p{L}\p{N}]/gu, ''));
        if (set.has(str)) return false;
        set.add(str);
        return true;
      });

    return filterSameQueries;
  };

  let queries = [query];
  let reRankQuery = query;

  // Use LLM to generate extension queries
  const aiExtensionResult = await (async () => {
    if (!llmModel || !embeddingModel) return;

    try {
      const result = await queryExtension({
        chatBg: extensionBg,
        query,
        histories,
        llmModel,
        embeddingModel,
        userKey,
        teamId
      });
      if (result.extensionQueries?.length === 0) return;
      return result;
    } catch (error) {
      logger.error('Failed to generate extension queries', { error });
    }
  })();

  if (aiExtensionResult) {
    queries = filterSameQuery(queries.concat(aiExtensionResult.extensionQueries));
    reRankQuery = queries.join('\n');
  }

  queries = await standardizeDatasetSearchQueries({ teamId, datasetIds, queries });

  return {
    searchQueries: queries,
    reRankQuery,
    aiExtensionResult
  };
};
