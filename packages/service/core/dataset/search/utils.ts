import { queryExtension } from '../../ai/functions/queryExtension';
import { type ChatItemType } from '@fastgpt/global/core/chat/type';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { addLog } from '../../../common/system/log';

export const datasetSearchQueryExtension = async ({
  query,
  llmModel,
  embeddingModel,
  extensionBg = '',
  histories = []
}: {
  query: string;
  llmModel?: string;
  embeddingModel?: string;
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

  // 检查传入的 query 是否已经进行过扩展
  let { queries, reRankQuery, alreadyExtension } = (() => {
    /* if query already extension, direct parse */
    try {
      const jsonParse = JSON.parse(query);
      const queries: string[] = Array.isArray(jsonParse) ? filterSamQuery(jsonParse) : [query];
      const alreadyExtension = Array.isArray(jsonParse);
      return {
        queries,
        reRankQuery: alreadyExtension ? queries.join('\n') : query,
        alreadyExtension
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

    try {
      const result = await queryExtension({
        chatBg: extensionBg,
        query,
        histories,
        llmModel,
        embeddingModel
      });
      if (result.extensionQueries?.length === 0) return;
      return result;
    } catch (error) {
      addLog.error('Failed to generate extension queries', error);
    }
  })();

  if (aiExtensionResult) {
    queries = queries.concat(aiExtensionResult.extensionQueries);
    reRankQuery = queries.join('\n');
  }

  return {
    searchQueries: queries,
    reRankQuery,
    aiExtensionResult
  };
};
