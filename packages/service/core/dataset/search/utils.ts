import { queryExtension } from '../../ai/functions/queryExtension';
import { type ChatItemType } from '@fastgpt/global/core/chat/type';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { getLogger, LogCategories } from '../../../common/logger';
import { countPromptTokens } from '../../../common/string/tiktoken/index';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

export const splitTextByRerankBudget = async ({
  text,
  docBudget
}: {
  text: string;
  docBudget: number;
}): Promise<string[]> => {
  const formatText = text.trim();
  if (!formatText) return [];

  const tokens = await countPromptTokens(formatText);
  if (tokens <= docBudget) {
    return [formatText];
  }
  // token 2 char
  const approxChunkSize = docBudget * 2;
  const { chunks } = splitText2Chunks({
    text: formatText,
    chunkSize: approxChunkSize,
    overlapRatio: 0
  });

  const splitChunks = chunks.map((item) => item.trim()).filter(Boolean);
  return splitChunks.length > 0 ? splitChunks : [formatText];
};

export const computeFilterIntersection = (lists: (string[] | undefined)[]) => {
  const validLists = lists.filter((list): list is string[] => list !== undefined);

  if (validLists.length === 0) return undefined;

  // reduce without initial value uses first element as accumulator
  return validLists.reduce((acc, list) => {
    const set = new Set(list);
    return acc.filter((id) => set.has(id));
  });
};

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
      logger.error('Failed to generate extension queries', { error });
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
