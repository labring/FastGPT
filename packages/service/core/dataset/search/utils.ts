import { queryExtension } from '../../ai/functions/queryExtension';
import { type ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { getLogger, LogCategories } from '../../../common/logger';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import { getImageBase64 } from '../../../common/file/image/utils';
import { getS3DatasetSource } from '../../../common/s3/sources/dataset';
import { isS3ObjectKey } from '../../../common/s3/utils';

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

export const normalizeImageToBase64 = async (imageUrl: string) => {
  if (imageUrl.startsWith('data:image/')) {
    return imageUrl;
  }

  if (
    isS3ObjectKey(imageUrl, 'dataset') ||
    isS3ObjectKey(imageUrl, 'temp') ||
    isS3ObjectKey(imageUrl, 'chat')
  ) {
    return getS3DatasetSource().getDatasetBase64Image(imageUrl);
  }

  const { completeBase64 } = await getImageBase64(imageUrl);
  return completeBase64;
};

export const datasetSearchQueryExtension = async ({
  query,
  llmModel,
  embeddingModel,
  userKey,
  extensionBg = '',
  histories = []
}: {
  query: string;
  llmModel?: string;
  embeddingModel?: string;
  userKey?: OpenaiAccountType;
  extensionBg?: string;
  histories?: ChatItemMiniType[];
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
  const {
    queries: initQueries,
    reRankQuery: initReRankQuery,
    alreadyExtension
  } = (() => {
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
    } catch {
      return {
        queries: [query],
        reRankQuery: query,
        alreadyExtension: false
      };
    }
  })();
  let queries = initQueries;
  let reRankQuery = initReRankQuery;

  // Use LLM to generate extension queries
  const aiExtensionResult = await (async () => {
    if (!llmModel || !embeddingModel || alreadyExtension) return;

    try {
      const result = await queryExtension({
        chatBg: extensionBg,
        query,
        histories,
        llmModel,
        embeddingModel,
        userKey
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
