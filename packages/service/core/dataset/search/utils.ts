import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { queryExtension } from '../../ai/functions/queryExtension';
import { ChatItemType } from '@fastgpt/global/core/chat/type';
import { hashStr } from '@fastgpt/global/common/string/tools';

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
  // concat query
  let queries = [query];
  let rewriteQuery =
    histories.length > 0
      ? `${histories
          .map((item) => {
            return `${item.obj}: ${item.value}`;
          })
          .join('\n')}
    Human: ${query}
    `
      : query;

  // ai extension
  const aiExtensionResult = await (async () => {
    if (!extensionModel) return;
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
    queries = queries.concat(aiExtensionResult.extensionQueries);
    rewriteQuery = queries.join('\n');
  }

  const set = new Set<string>();
  const filterSameQueries = queries.filter((item) => {
    // 删除所有的标点符号与空格等，只对文本进行比较
    const str = hashStr(item.replace(/[^\p{L}\p{N}]/gu, ''));
    if (set.has(str)) return false;
    set.add(str);
    return true;
  });

  return {
    concatQueries: filterSameQueries,
    rewriteQuery,
    aiExtensionResult
  };
};
