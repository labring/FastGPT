import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';

/**
 * 计算 workflow nodeResponse 子节点的总积分。
 *
 * childTotalPoints 是前端运行详情展示字段，必须从当前 childrenResponses 重新计算；
 * 不能复用旧值，否则后续追加 tool response compress child 时容易展示过期消耗。
 */
export const getAgentLoopCoreChildrenTotalPoints = (
  childrenResponses: ChatHistoryItemResType[] = []
) => childrenResponses.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

/**
 * 根据 childrenResponses 刷新 nodeResponse.childTotalPoints。
 *
 * 没有子消耗时移除 childTotalPoints，保持和历史 nodeResponse 结构一致。
 */
export const withAgentLoopCoreChildTotalPoints = (
  nodeResponse: ChatHistoryItemResType
): ChatHistoryItemResType => {
  const restNodeResponse = { ...nodeResponse };
  delete restNodeResponse.childTotalPoints;

  const childTotalPoints = getAgentLoopCoreChildrenTotalPoints(nodeResponse.childrenResponses);
  return {
    ...restNodeResponse,
    ...(childTotalPoints > 0 ? { childTotalPoints } : {})
  };
};

/**
 * 向 nodeResponse 追加子运行详情，并同步刷新 childTotalPoints。
 */
export const appendAgentLoopCoreChildNodeResponses = ({
  nodeResponse,
  childrenResponses
}: {
  nodeResponse: ChatHistoryItemResType;
  childrenResponses: ChatHistoryItemResType[];
}): ChatHistoryItemResType => {
  if (!childrenResponses.length) {
    return withAgentLoopCoreChildTotalPoints(nodeResponse);
  }

  return withAgentLoopCoreChildTotalPoints({
    ...nodeResponse,
    childrenResponses: [...(nodeResponse.childrenResponses || []), ...childrenResponses]
  });
};
