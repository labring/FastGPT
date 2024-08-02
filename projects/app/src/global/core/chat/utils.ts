import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { ChatHistoryItemResType, ChatItemType } from '@fastgpt/global/core/chat/type';
import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const isLLMNode = (item: ChatHistoryItemResType) =>
  item.moduleType === FlowNodeTypeEnum.chatNode || item.moduleType === FlowNodeTypeEnum.tools;

function transformPreviewHistories(histories: ChatItemType[]) {
  return histories.map((item) => {
    return {
      ...transformHistoryItem(item),
      responseData: undefined
    };
  });
}

function transformHistoryItem(historyItem: ChatItemType) {
  if (historyItem.obj !== ChatRoleEnum.AI) return historyItem;
  if (
    historyItem.totalQuoteList &&
    historyItem.llmModuleAccount &&
    historyItem.totalRunningTime &&
    historyItem.historyPreviewLength
  )
    return historyItem;
  const flatResData: ChatHistoryItemResType[] =
    historyItem.responseData
      ?.map((item) => {
        if (item.pluginDetail || item.toolDetail) {
          return [item, ...(item.pluginDetail || []), ...(item.toolDetail || [])];
        }
        return item;
      })
      .flat() || [];

  historyItem.llmModuleAccount = flatResData.filter(isLLMNode).length;
  historyItem.totalQuoteList = flatResData
    .filter((item) => item.moduleType === FlowNodeTypeEnum.datasetSearchNode)
    .map((item) => item.quoteList)
    .flat()
    .filter(Boolean) as SearchDataResponseItemType[];
  historyItem.totalRunningTime = Number(
    flatResData.reduce((sum, item) => sum + (item.runningTime || 0), 0).toFixed(2)
  );
  historyItem.historyPreviewLength = flatResData.find(isLLMNode)?.historyPreview?.length;
  return historyItem;
}
export { transformHistoryItem, transformPreviewHistories };
