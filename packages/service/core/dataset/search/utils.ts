import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { queryExtension } from '../../ai/functions/queryExtension';
import { ChatItemType } from '@fastgpt/global/core/chat/type';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';

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
  if (aiExtensionResult) {
    queries = filterSamQuery(queries.concat(aiExtensionResult.extensionQueries));
    rewriteQuery = queries.join('\n');
  }

  return {
    concatQueries: queries,
    rewriteQuery,
    aiExtensionResult
  };
};
