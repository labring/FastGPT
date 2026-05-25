import { queryExtension, queryExtensionForAssistant } from '../../ai/functions/queryExtension';
import { type ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { getLLMModel } from '../../ai/model';
import { searchSynonymMappings } from '../synonym/controller';
import { getLogger, LogCategories } from '../../../common/logger';
import { applySynonymTransform } from '../indexTransform/utils';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

export const computeFilterIntersection = (lists: (string[] | undefined)[]) => {
  const validLists = lists.filter((list): list is string[] => list !== undefined);

  if (validLists.length === 0) return undefined;

  // reduce without initial value uses first element as accumulator
  return validLists.reduce((acc, list) => {
    const set = new Set(list);
    return acc.filter((id) => set.has(id));
  });
};

// 辅助函数：从多个知识库检索标准词映射并汇总
export async function getSynonymMappings({
  teamId,
  datasetIds,
  query
}: {
  teamId: string;
  datasetIds: string[];
  query: string;
}): Promise<{
  synonymDict: Record<string, string[]>;
  synonymFileIds: string[];
}> {
  try {
    // 对每个知识库进行全文检索，获取 top10 同义词映射
    const allMappingsPromises = datasetIds.map((datasetId) =>
      searchSynonymMappings({
        teamId,
        datasetId,
        query,
        limit: 10
      }).catch((error) => {
        logger.debug('Get synonym mappings error for dataset', { datasetId, error });
        return [];
      })
    );

    const allMappingsResults = await Promise.all(allMappingsPromises);

    // 汇总所有知识库的同义词映射
    const synonymDict: Record<string, string[]> = {};
    const synonymFileIdSet = new Set<string>();

    for (const mappings of allMappingsResults) {
      for (const mapping of mappings) {
        const { standardizedTerm, synonymTerms, synonymFileId } = mapping;
        if (!synonymDict[standardizedTerm]) {
          synonymDict[standardizedTerm] = [];
        }
        // 合并同义词，去重
        const existingSet = new Set(synonymDict[standardizedTerm]);
        for (const synonym of synonymTerms) {
          existingSet.add(synonym);
        }
        synonymDict[standardizedTerm] = Array.from(existingSet);

        // 收集文件ID
        if (synonymFileId) {
          synonymFileIdSet.add(String(synonymFileId));
        }
      }
    }

    return {
      synonymDict,
      synonymFileIds: Array.from(synonymFileIdSet)
    };
  } catch (error) {
    logger.debug('Get synonym mappings error', { error });
    return {
      synonymDict: {},
      synonymFileIds: []
    };
  }
}

// 辅助函数：标准化(同义词替换)
// 复用 applySynonymTransform 算法，确保 query 和 chunk 使用相同的替换策略
export function standardizeQuery(query: string, synonyms: Record<string, string[]>): string {
  // 构建空的 synonymMappingMap，因为 query 替换不需要记录 mappingId
  const synonymMappingMap: Record<string, string> = {};
  for (const aliasList of Object.values(synonyms)) {
    for (const alias of aliasList) {
      synonymMappingMap[alias] = ''; // query 替换不需要 mappingId
    }
  }

  // 使用与 chunk 相同的智能替换算法
  const { transformedText } = applySynonymTransform(query, synonyms, synonymMappingMap);
  return transformedText;
}

/**
 * 数据集搜索查询扩展函数
 *
 * 四个场景说明：
 * ────────────────────────────────────────────────────────────────
 * 场景1: isAssistant=false, llmModel=undefined (非assistant类型应用 + 不开启问题改写)
 *        流程: 独立同义词改写 → return
 *        有同义词: queries = [原始, 标准化]
 *        无同义词: queries = [原始]
 *
 * 场景2: isAssistant=false, llmModel=存在 (非assistant类型应用 + 开启问题改写)
 *        流程: 独立同义词改写 → 问题改写 → 合并结果
 *        有同义词: queries = [原始, 标准化, 改写1, 改写2, ...]
 *        无同义词: queries = [原始, 改写1, 改写2, ...]
 *        注意：改写问题未进行同义词标准化
 *
 * 场景3: isAssistant=true, llmModel=undefined (assistant类型应用 + 不开启问题改写)
 *        流程: 独立同义词改写 → return
 *        有同义词: queries = [原始, 标准化]
 *        无同义词: queries = [原始]
 *
 * 场景4: isAssistant=true, llmModel=存在 (assistant类型应用 + 开启问题改写)
 *        流程: 独立同义词改写 → queryExtensionForAssistant()内部:
 *              ① 指代消除 ② 问题改写 ③ 同义词标准化所有问题
 *        queries = [标准化(指代消除), 标准化(改写1), 标准化(改写2), ...]
 *        所有问题都经过指代消除 + 同义词标准化，质量最高
 *        说明: queryExtensionForAssistant内部已完整处理，外部不再做同义词改写
 * ────────────────────────────────────────────────────────────────
 */
export const datasetSearchQueryExtension = async ({
  query,
  llmModel,
  embeddingModel,
  extensionBg = '',
  histories = [],
  isAssistant = false,
  teamId,
  datasetIds,
  lang
}: {
  query: string;
  llmModel?: string;
  embeddingModel?: string;
  extensionBg?: string;
  histories?: ChatItemMiniType[];
  isAssistant?: boolean;
  teamId?: string;
  datasetIds?: string[];
  lang: string;
}) => {
  // 仅assistant场景下统计整个问题改写流程的耗时
  const startTime = isAssistant ? Date.now() : undefined;

  const filterSamQuery = (queries: string[]) => {
    const set = new Set<string>();
    const filterSameQueries = queries.filter((item) => {
      // 删除所有的标点符号与空格等，只对文本进行比较
      const str = hashStr(item.replace(/[^\p{L}\p{N}]/gu, ''));
      if (set.has(str)) return false;
      set.add(str);
      return true;
    });

    return filterSameQueries;
  };

  let { queries, reRankQuery, alreadyExtension } = (() => {
    /* if query already extension, direct parse */
    try {
      const jsonParse = JSON.parse(query);
      const queries: string[] = Array.isArray(jsonParse) ? filterSamQuery(jsonParse) : [query];
      const alreadyExtension = Array.isArray(jsonParse);
      return {
        queries,
        reRankQuery: alreadyExtension ? queries.join('\n') : query,
        alreadyExtension: alreadyExtension
      };
    } catch (error) {
      return {
        queries: [query],
        reRankQuery: query,
        alreadyExtension: false
      };
    }
  })();

  /**
   * 【独立的同义词改写】场景1/2/3 都会执行这段逻辑
   *
   * 执行条件: teamId && datasetIds && !alreadyExtension
   * 处理对象: 原始query (不是改写后的问题)
   * 输出: queries = [原始query, 标准化query]
   *
   * 说明: 这是一个通用的、与问题改写无关的同义词标准化逻辑
   */
  let synonymRewriteResult: { standardizedQuery: string; coreferenceResolved: string } | undefined =
    undefined;
  if (teamId && datasetIds && datasetIds.length > 0 && !alreadyExtension) {
    const { synonymDict } = await getSynonymMappings({
      teamId,
      datasetIds,
      query
    });

    // 用标准词替换查询中的同义词
    if (Object.keys(synonymDict).length > 0) {
      const standardizedQuery = standardizeQuery(query, synonymDict);

      if (standardizedQuery !== query) {
        synonymRewriteResult = { standardizedQuery, coreferenceResolved: query };
        queries = [query, standardizedQuery]; // 原始在第1位，标准化在第2位
        logger.debug('Synonym rewrite applied', {
          original: query,
          standardized: standardizedQuery
        });
      }
    }
  }

  /**
   * 【问题改写分支】场景2/4 会执行这段逻辑
   *
   * 条件判断: llmModel && embeddingModel && !alreadyExtension
   *
   * 场景2 (非assistant类型应用): 调用 queryExtension()
   *       返回: extensionQueries = [改写问题1, 改写问题2, ...]
   *       这些改写问题未经过同义词标准化
   *
   * 场景4 (assistant类型应用): 调用 queryExtensionForAssistant()
   *       内部逻辑:
   *       ① 指代消除 + 问题改写
   *       ② 获取同义词映射 (基于指代消除后的query)
   *       ③ 对所有问题进行同义词标准化
   *       返回: extensionQueries = [标准化(指代消除), 标准化(改写1), ...]
   *       所有问题都已标准化，质量最高
   */
  const aiExtensionResult = await (async () => {
    if (!llmModel || !embeddingModel || alreadyExtension) return;

    // 如果是 assistant 类型且有 teamId 和 datasetIds，使用新逻辑
    if (isAssistant && teamId && datasetIds && datasetIds.length > 0) {
      const result = await queryExtensionForAssistant({
        query,
        histories,
        model: llmModel,
        teamId,
        datasetIds,
        lang
      });
      if (result.extensionQueries?.length === 0) return;
      return result;
    }

    const result = await queryExtension({
      chatBg: extensionBg,
      query,
      histories,
      llmModel,
      embeddingModel
    });
    if (result.extensionQueries?.length === 0) return;
    return result;
  })();

  /**
   * 【结果合并逻辑】
   *
   * 场景2 (非assistant类型应用 + 问题改写):
   *   if (aiExtensionResult) 成立
   *   - 合并独立同义词改写和问题改写的结果
   *   - 有同义词: queries = [原始, 标准化, 改写1, 改写2, ...]
   *   - 无同义词: queries = [原始, 改写1, 改写2, ...]
   *   - 继续执行，不返回
   *
   * 场景4 (assistant类型应用 + 问题改写):
   *   if (aiExtensionResult) 成立
   *   - aiExtensionResult.synonymRewriteResult 已有值 (来自queryExtensionForAssistant内部)
   *   - extensionQueries 已包含所有标准化问题：[标准化(指代消除), 标准化(改写1), ...]
   *   - 不再执行外部的独立同义词改写逻辑
   *   - 继续执行，不返回
   *
   * 场景1/3 (不开启问题改写):
   *   if (aiExtensionResult) 不成立
   *   else if (synonymRewriteResult) 成立
   *   - 纯同义词改写分支，直接 return
   *   - 有同义词: queries = [原始, 标准化]
   *   - 无同义词: queries = [原始]
   */

  // 用于落库的改写问题（不包含原始问题，只包含改写后的问题）
  let queriesForStorage = '';

  if (aiExtensionResult) {
    // 如果有问题改写结果，只保存改写后的问题（不包含原始问题）
    queriesForStorage = aiExtensionResult.extensionQueries.join('\n');
    queries = queries.concat(aiExtensionResult.extensionQueries);
    reRankQuery = queries.join('\n');
    // 如果 aiExtensionResult 有同义词结果,使用它;否则使用独立的同义词结果
    if (!aiExtensionResult.synonymRewriteResult && synonymRewriteResult) {
      aiExtensionResult.synonymRewriteResult = synonymRewriteResult;
    }
  } else if (synonymRewriteResult) {
    // 如果没有问题改写但有同义词改写,创建一个结果对象
    const dummyResult = {
      llmModel: '',
      embeddingModel: '',
      inputTokens: 0,
      outputTokens: 0,
      embeddingTokens: 0,
      extensionQueries: [] as string[],
      synonymRewriteResult
    };
    return {
      searchQueries: queries,
      reRankQuery,
      aiExtensionResult: dummyResult,
      rewriteTime: undefined,
      // 纯同义词改写场景不落库:
      // 1. 同义词替换是基于规则的映射,不是AI生成的内容,不需要记录
      // 2. standardizedQuery已在synonymRewriteResult中保存,可通过该字段访问
      // 3. queriesForStorage专门用于存储AI改写生成的问题,同义词替换不属于此类
      queriesForStorage: ''
    };
  }

  /**
   * 【assistant类型应用专用处理】仅场景4执行
   *
   * 场景4 (isAssistant=true):
   *   queries 当前格式: [原始, 标准化(指代消除), 标准化(改写1), 标准化(改写2), ...]
   *   queriesForStorage 当前格式: 标准化(指代消除)\n标准化(改写1)\n标准化(改写2)\n...（不包含原始问题）
   *   进行分号拼接: queries = [标准化1;标准化2;标准化3;...]
   *   用于多路并行检索: 每个query作为独立的检索请求
   *
   *   reRankQuery 进行换行拼接，用于reranker使用
   *
   * 场景1/2/3 (isAssistant=false):
   *   不执行此逻辑，queries 保持数组形式
   */
  //参考客服跑验证集逻辑，不开问题优化，传入的query是原始query+问题改写+指代消除的标准化后的；拼接在一起

  // queriesForStorage 已在上面的 if (aiExtensionResult) 分支中设置，无需再次处理

  if (isAssistant) {
    reRankQuery = queries.join('\n'); // 先计算 reranker 使用的换行符拼接
    queries = [queries.join(';')]; // 检索使用分号拼接
  }

  // 计算问题改写耗时（仅assistant场景且实际执行了改写逻辑）
  const rewriteTime =
    startTime !== undefined ? +((Date.now() - startTime) / 1000).toFixed(2) : undefined;

  return {
    searchQueries: queries,
    reRankQuery,
    aiExtensionResult,
    rewriteTime,
    queriesForStorage // 用于落库的 query（只包含改写后的问题，不包含原始问题）
  };
};

// Get dataset SQL result limit from config or environment variable
export const getDatasetSqlResultLimit = (): number => {
  const configLimit = global.systemEnv?.datasetSqlResultLimit;
  if (configLimit !== undefined) return configLimit;

  const envLimit = process.env.DATASET_SQL_RESULT_LIMIT;
  if (envLimit) {
    const parsed = Number(envLimit);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return 100; // Default
};

// Calculate dynamic limit based on LLM model's max context and safety factor
export const calculateDynamicLimit = ({
  generateSqlModel,
  safetyFactor = 0.6,
  estimatedTokensPerItem = 512
}: {
  generateSqlModel?: string;
  safetyFactor?: number;
  estimatedTokensPerItem?: number;
}): number => {
  // Get the LLM model configuration
  const llmModel = getLLMModel(generateSqlModel);

  // Calculate safe limit based on model's maxContext
  const modelMaxToken = llmModel.maxContext;
  const safeLimit = Math.floor((modelMaxToken * safetyFactor) / estimatedTokensPerItem);

  // Ensure minimum limit of 5 and maximum of 50 for reasonable performance
  const finalLimit = Math.max(5, Math.min(safeLimit, 50));

  return finalLimit;
};
