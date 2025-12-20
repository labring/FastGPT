import { type LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { queryExtension, queryExtensionForAssistant } from '../../ai/functions/queryExtension';
import { type ChatItemType } from '@fastgpt/global/core/chat/type';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { getLLMModel } from '../../ai/model';

export const datasetSearchQueryExtension = async ({
  query,
  extensionModel,
  extensionBg = '',
  histories = [],
  isAssistant = false,
  teamId,
  datasetIds
}: {
  query: string;
  extensionModel?: LLMModelItemType;
  extensionBg?: string;
  histories?: ChatItemType[];
  isAssistant?: boolean;
  teamId?: string;
  datasetIds?: string[];
}) => {
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

  let { queries, rewriteQuery, alreadyExtension } = (() => {
    /* if query already extension, direct parse */
    try {
      const jsonParse = JSON.parse(query);
      const queries: string[] = Array.isArray(jsonParse) ? filterSamQuery(jsonParse) : [query];
      const alreadyExtension = Array.isArray(jsonParse);
      return {
        queries,
        rewriteQuery: alreadyExtension ? queries.join('\n') : query,
        alreadyExtension: alreadyExtension
      };
    } catch (error) {
      return {
        queries: [query],
        rewriteQuery: query,
        alreadyExtension: false
      };
    }
  })();

  // ai extension
  const aiExtensionResult = await (async () => {
    if (!extensionModel || alreadyExtension) return;

    // 如果是 assistant 类型且有 teamId 和 datasetIds，使用新逻辑
    if (isAssistant && teamId && datasetIds && datasetIds.length > 0) {
      const result = await queryExtensionForAssistant({
        query,
        histories,
        model: extensionModel.model,
        teamId,
        datasetIds
      });
      if (result.extensionQueries?.length === 0) return;
      return result;
    }

    // 否则使用原有逻辑
    const result = await queryExtension({
      chatBg: extensionBg,
      query,
      histories,
      model: extensionModel.model
    });
    if (result.extensionQueries?.length === 0) return;
    return result;
  })();

  const extensionQueries = filterSamQuery(aiExtensionResult?.extensionQueries || []);
  if (aiExtensionResult) {
    queries = filterSamQuery(queries.concat(extensionQueries));
    rewriteQuery = queries.join('\n');
  }

  //参考客服跑验证集逻辑，不开问题优化，传入的query是原始query+问题改写+指代消除的标准化后的；拼接在一起
  if (isAssistant) {
    queries = [queries.join(';')];
    rewriteQuery = queries.join(';');
  }

  return {
    extensionQueries,
    concatQueries: queries,
    rewriteQuery,
    aiExtensionResult
  };
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
