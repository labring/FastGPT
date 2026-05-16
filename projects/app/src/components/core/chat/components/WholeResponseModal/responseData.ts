import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { SideTabItemType } from './types';

export const flattenResponse = (response: ChatHistoryItemResType[]) => {
  const result: ChatHistoryItemResType[] = [];

  const helper = (currentArray: ChatHistoryItemResType[]) => {
    currentArray.forEach((item) => {
      if (item && typeof item === 'object') {
        result.push(item);

        if (Array.isArray(item.toolDetail)) {
          helper(item.toolDetail);
        }
        if (Array.isArray(item.pluginDetail)) {
          helper(item.pluginDetail);
        }
        if (Array.isArray(item.loopDetail)) {
          helper(item.loopDetail);
        }
        if (Array.isArray(item.parallelDetail)) {
          helper(item.parallelDetail);
        }
        if (Array.isArray(item.loopRunDetail)) {
          helper(item.loopRunDetail);
        }
        if (Array.isArray(item.childrenResponses)) {
          helper(item.childrenResponses);
        }
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

    if (item?.toolDetail) children.push(...getSideTabItems(item.toolDetail));
    if (item?.pluginDetail) children.push(...getSideTabItems(item.pluginDetail));
    if (item?.loopDetail) children.push(...getSideTabItems(item.loopDetail));
    if (item?.parallelDetail) children.push(...getSideTabItems(item.parallelDetail));
    if (item?.loopRunDetail) children.push(...getSideTabItems(item.loopRunDetail));
    if (item?.childrenResponses) children.push(...getSideTabItems(item.childrenResponses));

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
