import { type LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { queryExtension } from '../../ai/functions/queryExtension';
import { type ChatItemType } from '@fastgpt/global/core/chat/type';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { getLLMModel } from '../../ai/model';

export const datasetSearchQueryExtension = async ({
  query,
  extensionModel,
  extensionBg = '',
  histories = []
}: {
  query: string;
  extensionModel?: LLMModelItemType;
  extensionBg?: string;
  histories?: ChatItemType[];
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
    // concat query
    let rewriteQuery =
      histories.length > 0
        ? `${histories
            .map((item) => {
              return `${item.obj}: ${chatValue2RuntimePrompt(item.value).text}`;
            })
            .join('\n')}
Human: ${query}
`
        : query;

    /* if query already extension, direct parse */
    try {
      const jsonParse = JSON.parse(query);
      const queries: string[] = Array.isArray(jsonParse) ? filterSamQuery(jsonParse) : [query];
      const alreadyExtension = Array.isArray(jsonParse);
      return {
        queries,
        rewriteQuery: alreadyExtension ? queries.join('\n') : rewriteQuery,
        alreadyExtension: alreadyExtension
      };
    } catch (error) {
      return {
        queries: [query],
        rewriteQuery,
        alreadyExtension: false
      };
    }
  })();

  // ai extension
  const aiExtensionResult = await (async () => {
    if (!extensionModel || alreadyExtension) return;
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
