import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { type ChatHistoryItemResType, type ChatItemType } from '@fastgpt/global/core/chat/type';
import { type SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { type CiteLinksType } from '@fastgpt/global/core/chat/type';

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
  if (historyItem.totalQuoteList !== undefined || historyItem.externalLinkList !== undefined)
    return historyItem;
  if (!historyItem.responseData) return historyItem;

  // Flat children
  const flatResData = getFlatAppResponses(historyItem.responseData || []);

  // get llm module account and history preview length and total quote list and external link list
  const { llmModuleAccount, historyPreviewLength, totalQuoteList, externalLinkList } =
    flatResData.reduce(
      (acc, item) => {
        const result = { ...acc };
        if (isLLMNode(item)) {
          result.llmModuleAccount = acc.llmModuleAccount + 1;
          if (acc.historyPreviewLength === undefined) {
            result.historyPreviewLength = item.historyPreview?.length;
          }
        }
        if (item.moduleType === FlowNodeTypeEnum.datasetSearchNode && item.quoteList) {
          result.totalQuoteList.push(...item.quoteList.filter(Boolean));
        }

        const citeLinks = item?.toolRes?.referenceDocuments;
        if (citeLinks) {
          citeLinks.forEach((doc: { name: string; url: string }) => {
            const baseName = doc?.name || '';
            const url = doc?.url;
            if (url) {
              const key = `${baseName}::${url}`;
              if (!acc.linkDedupe.has(key)) {
                acc.linkDedupe.add(key);
                result.externalLinkList.push({ name: baseName, url });
              }
            }
          });
        }

        return result;
      },
      {
        llmModuleAccount: 0,
        historyPreviewLength: undefined as number | undefined,
        totalQuoteList: [] as SearchDataResponseItemType[],
        externalLinkList: [] as CiteLinksType[],
        linkDedupe: new Set<string>()
      }
    );

  return {
    ...historyItem,
    llmModuleAccount,
    totalQuoteList,
    historyPreviewLength,
    ...(externalLinkList.length ? { externalLinkList } : {})
  };
}
