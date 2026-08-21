import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { getChildrenResponses } from '@fastgpt/global/core/chat/utils/mergeNode';
import type { SideTabItemType } from './types';
import { getWorkflowBuilderToolPresentation } from '../AIResponseBox/utils';

/**
 * 将 Workflow Builder 工具的运行元数据转换为聊天区统一使用的中文名称和 Figma 图标。
 * 转换放在完整响应的数据入口，确保侧栏、详情标题和名称字段不会各自重复判断。
 */
const getPresentedResponse = (item: ChatHistoryItemResType): ChatHistoryItemResType => {
  const presentation = getWorkflowBuilderToolPresentation(item.toolId);
  if (!presentation) return item;

  return {
    ...item,
    moduleName: presentation.nameKey,
    moduleLogo: presentation.avatar
  };
};

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

  return result.map((item) => {
    const presentedItem = getPresentedResponse(item);

    return {
      ...presentedItem,
      id: presentedItem.id ?? presentedItem.nodeId
    };
  });
};

export const getSideTabItems = (response: ChatHistoryItemResType[]): SideTabItemType[] => {
  return response.map((item) => {
    const presentedItem = getPresentedResponse(item);
    const children: SideTabItemType[] = [];

    children.push(...getSideTabItems(getChildrenResponses(item)));

    return {
      moduleLogo: presentedItem.moduleLogo,
      moduleName: presentedItem.moduleName,
      moduleNameArgs: presentedItem.moduleNameArgs,
      runningTime: presentedItem.runningTime,
      moduleType: presentedItem.moduleType,
      id: presentedItem.id ?? presentedItem.nodeId,
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
