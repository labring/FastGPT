import { queryExtension, queryExtensionForAssistant } from '../../ai/functions/queryExtension';
import { type ChatItemType } from '@fastgpt/global/core/chat/type';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { getLLMModel } from '../../ai/model';

export const datasetSearchQueryExtension = async ({
  query,
  llmModel,
  embeddingModel,
  extensionBg = '',
  histories = [],
  isAssistant = false,
  teamId,
  datasetIds
}: {
  query: string;
  llmModel?: string;
  embeddingModel?: string;
  extensionBg?: string;
  histories?: ChatItemType[];
  isAssistant?: boolean;
  teamId?: string;
  datasetIds?: string[];
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

  // Use LLM to generate extension queries
  const aiExtensionResult = await (async () => {
    if (!llmModel || !embeddingModel || alreadyExtension) return;

    // 如果是 assistant 类型且有 teamId 和 datasetIds，使用新逻辑
    if (isAssistant && teamId && datasetIds && datasetIds.length > 0) {
      const result = await queryExtensionForAssistant({
        query,
        histories,
        model: llmModel,
        teamId,
        datasetIds
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

  if (aiExtensionResult) {
    queries = queries.concat(aiExtensionResult.extensionQueries);
    reRankQuery = queries.join('\n');
  }

  //参考客服跑验证集逻辑，不开问题优化，传入的query是原始query+问题改写+指代消除的标准化后的；拼接在一起
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
    rewriteTime
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
