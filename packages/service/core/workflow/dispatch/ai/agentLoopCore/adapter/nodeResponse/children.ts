import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { stripNodeResponseChildTotalPoints } from '@fastgpt/global/core/chat/utils/mergeNode';

/**
 * 移除旧的 childTotalPoints 缓存字段。
 * 子节点积分由客户端基于合并后的 childrenResponses 动态计算。
 */
export const stripAgentLoopCoreChildTotalPoints = (
  nodeResponse: ChatHistoryItemResType
): ChatHistoryItemResType => stripNodeResponseChildTotalPoints(nodeResponse);

/** 向 nodeResponse 追加子运行详情，并移除旧的 childTotalPoints 缓存。 */
export const appendAgentLoopCoreChildNodeResponses = ({
  nodeResponse,
  childrenResponses
}: {
  nodeResponse: ChatHistoryItemResType;
  childrenResponses: ChatHistoryItemResType[];
}): ChatHistoryItemResType => {
  if (!childrenResponses.length) {
    return stripAgentLoopCoreChildTotalPoints(nodeResponse);
  }

  return stripAgentLoopCoreChildTotalPoints({
    ...nodeResponse,
    childrenResponses: [...(nodeResponse.childrenResponses || []), ...childrenResponses]
  });
};
