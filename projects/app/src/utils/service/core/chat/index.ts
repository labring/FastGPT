import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';

export const selectShareResponse = ({
  responseData = []
}: {
  responseData?: ChatHistoryItemResType[];
}) => {
  const filedList = ['quoteList', 'moduleType'];
  const filterModuleTypeList: any[] = [FlowNodeTypeEnum.chatNode];
  return responseData
    .filter((item) => filterModuleTypeList.includes(item.moduleType))
    .map((item) => {
      const obj: Record<string, any> = {};
      for (let key in item) {
        if (filedList.includes(key)) {
          // @ts-ignore
          obj[key] = item[key];
        }
      }
      return obj as ChatHistoryItemResType;
    });
};
