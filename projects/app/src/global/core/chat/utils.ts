import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { type ChatHistoryItemResType, type ChatItemType } from '@fastgpt/global/core/chat/type';
import { type SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { type ToolCiteLinksType } from '@fastgpt/global/core/chat/type';

export const isLLMNode = (item: ChatHistoryItemResType) =>
  item.moduleType === FlowNodeTypeEnum.chatNode || item.moduleType === FlowNodeTypeEnum.agent;

export function transformPreviewHistories(
  histories: ChatItemType[],
  responseDetail: boolean
): ChatItemType[] {
  return histories.map((item) => {
    return {
      ...addStatisticalDataToHistoryItem(item),
      responseData: undefined,
      ...(responseDetail ? {} : { totalQuoteList: undefined })
    };
  });
}

export const getFlatAppResponses = (res: ChatHistoryItemResType[]): ChatHistoryItemResType[] => {
  return res
    .map((item) => {
      return [
        item,
        ...getFlatAppResponses(item.pluginDetail || []),
        ...getFlatAppResponses(item.toolDetail || []),
        ...getFlatAppResponses(item.loopDetail || [])
      ];
    })
    .flat();
};
export function addStatisticalDataToHistoryItem(historyItem: ChatItemType) {
  if (historyItem.obj !== ChatRoleEnum.AI) return historyItem;
  if (historyItem.totalQuoteList !== undefined || historyItem.toolCiteLinks !== undefined)
    return historyItem;
  if (!historyItem.responseData) return historyItem;

  // Flat children
  const flatResData = getFlatAppResponses(historyItem.responseData || []);

  // get llm module account and history preview length and total quote list and external link list
  const { llmModuleAccount, historyPreviewLength, totalQuoteList, toolCiteLinks } =
    flatResData.reduce(
      (acc, item) => {
        // LLM
        if (isLLMNode(item)) {
          acc.llmModuleAccount = acc.llmModuleAccount + 1;
          if (acc.historyPreviewLength === undefined) {
            acc.historyPreviewLength = item.historyPreview?.length;
          }
        }
        // Dataset search result
        if (item.moduleType === FlowNodeTypeEnum.datasetSearchNode && item.quoteList) {
          acc.totalQuoteList.push(...item.quoteList.filter(Boolean));
        }

        // Tool call
        if (item.moduleType === FlowNodeTypeEnum.tool) {
          const citeLinks = item?.toolRes?.citeLinks;
          if (citeLinks && Array.isArray(citeLinks)) {
            citeLinks.forEach(({ name = '', url = '' }: ToolCiteLinksType) => {
              if (url) {
                const key = `${name}::${url}`;
                if (!acc.linkDedupe.has(key)) {
                  acc.linkDedupe.add(key);
                  acc.toolCiteLinks.push({ name, url });
                }
              }
            });
          }
        }

        return acc;
      },
      {
        llmModuleAccount: 0,
        historyPreviewLength: undefined as number | undefined,
        totalQuoteList: [] as SearchDataResponseItemType[],
        toolCiteLinks: [] as ToolCiteLinksType[],
        linkDedupe: new Set<string>()
      }
    );

  return {
    ...historyItem,
    llmModuleAccount,
    totalQuoteList,
    historyPreviewLength,
    ...(toolCiteLinks.length ? { toolCiteLinks } : {})
  };
}
