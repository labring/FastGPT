import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { getChildrenResponses } from '@fastgpt/global/core/chat/utils/mergeNode';
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

export const getSideTabMaxDepth = (items: SideTabItemType[], depth = 1): number => {
  if (items.length === 0) return 0;

  return items.reduce((maxDepth, item) => {
    const childDepth =
      item.children.length > 0 ? getSideTabMaxDepth(item.children, depth + 1) : depth;

    return Math.max(maxDepth, childDepth);
  }, depth);
};
