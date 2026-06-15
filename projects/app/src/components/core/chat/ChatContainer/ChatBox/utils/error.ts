/**
 * 控制聊天气泡底部错误卡片的展示时机。
 * 正在生成的最后一条消息可能先收到节点错误再继续产出内容，生成中先隐藏，结束后再展示最终错误。
 */
export const shouldShowChatItemInlineError = ({
  hasInlineError,
  isChatting,
  isLastChild
}: {
  hasInlineError: boolean;
  isChatting: boolean;
  isLastChild: boolean;
}) => {
  return hasInlineError && !(isChatting && isLastChild);
};
