import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { getChildrenResponses } from '@fastgpt/global/core/chat/utils';
import type { SideTabItemType } from './types';

export const flattenResponse = (response: ChatHistoryItemResType[]) => {
  const result: ChatHistoryItemResType[] = [];

  const helper = (currentArray: ChatHistoryItemResType[]) => {
    currentArray.forEach((item) => {
      if (item && typeof item === 'object') {
        result.push(item);

        helper(getChildrenResponses(item));
      }
    });
  };

  helper(response);

  return result.map((item) => ({
    ...item,
    id: item.id ?? item.nodeId
  }));
};

export const getSideTabItems = (response: ChatHistoryItemResType[]): SideTabItemType[] => {
  return response.map((item) => {
    const children: SideTabItemType[] = [];

    children.push(...getSideTabItems(getChildrenResponses(item)));

    return {
      moduleLogo: item.moduleLogo,
      moduleName: item.moduleName,
      moduleNameArgs: item.moduleNameArgs,
      runningTime: item.runningTime,
      moduleType: item.moduleType,
      id: item.id ?? item.nodeId,
      children
    };
  });
};
