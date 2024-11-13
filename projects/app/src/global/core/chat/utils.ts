import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { ChatHistoryItemResType, ChatItemType } from '@fastgpt/global/core/chat/type';
import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const isLLMNode = (item: ChatHistoryItemResType) =>
  item.moduleType === FlowNodeTypeEnum.chatNode || item.moduleType === FlowNodeTypeEnum.tools;

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

export function addStatisticalDataToHistoryItem(historyItem: ChatItemType) {
  if (historyItem.obj !== ChatRoleEnum.AI) return historyItem;
  if (historyItem.totalQuoteList !== undefined) return historyItem;
  if (!historyItem.responseData) return historyItem;

  // Flat children
  const flatResData: ChatHistoryItemResType[] =
    historyItem.responseData
      ?.map((item) => {
        if (item.pluginDetail || item.toolDetail) {
          return [item, ...(item.pluginDetail || []), ...(item.toolDetail || [])];
        }
        return item;
      })
      .flat() || [];

  return {
    ...historyItem,
    llmModuleAccount: flatResData.filter(isLLMNode).length,
    totalQuoteList: flatResData
      .filter((item) => item.moduleType === FlowNodeTypeEnum.datasetSearchNode)
      .map((item) => item.quoteList)
      .flat()
      .filter(Boolean) as SearchDataResponseItemType[],
    totalRunningTime: Number(
      historyItem.responseData?.reduce((sum, item) => sum + (item.runningTime || 0), 0).toFixed(2)
    ),
    historyPreviewLength: flatResData.find(isLLMNode)?.historyPreview?.length
  };
}
