import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { ChatHistoryItemResType, ChatItemType } from '@fastgpt/global/core/chat/type';
import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const isLLMNode = (item: ChatHistoryItemResType) =>
  item.moduleType === FlowNodeTypeEnum.chatNode || item.moduleType === FlowNodeTypeEnum.tools;

function transformPreviewHistories(histories: ChatItemType[]) {
  histories.forEach((item) => {
    if (item.obj === ChatRoleEnum.AI) {
      const flatResData: ChatHistoryItemResType[] =
        item.responseData
          ?.map((item) => {
            if (item.pluginDetail || item.toolDetail) {
              return [item, ...(item.pluginDetail || []), ...(item.toolDetail || [])];
            }
            return item;
          })
          .flat() || [];

      item.llmModuleAccount = flatResData.filter(isLLMNode).length;
      item.totalQuoteList = flatResData
        .filter((item) => item.moduleType === FlowNodeTypeEnum.datasetSearchNode)
        .map((item) => item.quoteList)
        .flat()
        .filter(Boolean) as SearchDataResponseItemType[];
      item.totalRunningTime = Number(
        flatResData.reduce((sum, item) => sum + (item.runningTime || 0), 0).toFixed(2)
      );
      item.isResDataEmpty = !flatResData.length;
      item.historyPreviewLength = flatResData.find(isLLMNode)?.historyPreview?.length;
      item.responseData = [];
    }
  });
}
export default transformPreviewHistories;
