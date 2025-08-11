import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { type ChatHistoryItemResType, type ChatItemType } from '@fastgpt/global/core/chat/type';
import { type SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

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

  // Extract external link references from final tool responses in responseData
  const externalLinkList = (() => {
    try {
      const refs: { name: string; url: string }[] = [];
      const dedupe = new Set<string>();
      // Also parse from flattened flow node responses (toolRes.referenceDocuments)
      flatResData.forEach((res: ChatHistoryItemResType) => {
        const docs = res?.toolRes?.referenceDocuments;
        if (docs) {
          docs.forEach((doc: { name: string; webUrl?: string; dingUrl?: string }) => {
            const baseName = doc?.name || '';
            const webUrl = doc?.webUrl;
            const dingUrl = doc?.dingUrl;
            const push = (name: string, url?: string) => {
              if (!url) return;
              const key = `${name}::${url}`;
              if (!dedupe.has(key)) {
                dedupe.add(key);
                refs.push({ name, url });
              }
            };
            if (baseName) {
              push(`[Web] ${baseName}`, webUrl);
              push(`[Dingding] ${baseName}`, dingUrl);
            } else {
              push('[Web]', webUrl);
              push('[Dingding]', dingUrl);
            }
          });
        }
      });
      return refs;
    } catch (e) {
      return [] as { name: string; url: string }[];
    }
  })();

  return {
    ...historyItem,
    llmModuleAccount: flatResData.filter(isLLMNode).length,
    totalQuoteList: flatResData
      .filter((item) => item.moduleType === FlowNodeTypeEnum.datasetSearchNode)
      .map((item) => item.quoteList)
      .flat()
      .filter(Boolean) as SearchDataResponseItemType[],
    historyPreviewLength: flatResData.find(isLLMNode)?.historyPreview?.length,
    ...(externalLinkList.length ? { externalLinkList } : {})
  };
}
