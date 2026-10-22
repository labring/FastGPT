import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';

export const hasAiAnswerContent = (item: AIChatItemValueItemType) =>
  Boolean(item.text?.content?.trim());

export const hasAiInteractiveContent = (item: AIChatItemValueItemType) => Boolean(item.interactive);

export const hasAiProcessingContent = (item: AIChatItemValueItemType) => {
  if (item.hideInUI) return false;

  const tools = item.tools || (item.tool ? [item.tool] : undefined);
  return Boolean(
    (item.reasoning?.content && !item.hideReason) ||
    tools?.length ||
    item.skills?.length ||
    item.plan ||
    item.planStatus?.status === 'generating'
  );
};

export const hasAiFoldableProcessingContent = (item: AIChatItemValueItemType) => {
  if (item.hideInUI) return false;

  const tools = item.tools || (item.tool ? [item.tool] : undefined);
  return Boolean((item.reasoning?.content && !item.hideReason) || tools?.length);
};

export const hasAiStandaloneProcessingContent = (item: AIChatItemValueItemType) => {
  if (item.hideInUI) return false;

  return Boolean(item.skills?.length || item.plan || item.planStatus?.status === 'generating');
};

/**
 * 按正文与交互边界将一条 AI 记录分成气泡，连续的思考与工具调用跟随后续正文展示。
 * 返回值始终至少包含一个组，当前交互恢复生成时保留空响应占位。
 */
export const groupAIChatResponseValues = ({
  chatValue,
  isLastChild,
  isChatting
}: {
  chatValue: AIChatItemValueItemType[];
  isLastChild: boolean;
  isChatting: boolean;
}) => {
  const filterList = chatValue.filter((item) => !shouldFilterAiValue(item));

  const groupedValues: AIChatItemValueItemType[][] = [];
  let currentGroup: AIChatItemValueItemType[] = [];
  filterList.forEach((value) => {
    if (value.interactive) {
      if (currentGroup.length > 0) {
        groupedValues.push(currentGroup);
        currentGroup = [];
      }

      groupedValues.push([value]);
      return;
    }

    currentGroup.push(value);
    if (hasAiAnswerContent(value)) {
      groupedValues.push(currentGroup);
      currentGroup = [];
    }
  });

  if (currentGroup.length > 0) groupedValues.push(currentGroup);

  const lastGroup = groupedValues[groupedValues.length - 1];
  if (isLastChild && (isChatting || groupedValues.length === 0)) {
    if (lastGroup?.[lastGroup.length - 1]?.interactive || groupedValues.length === 0) {
      groupedValues.push([{ text: { content: '' } }]);
    }
  } else if (groupedValues.length === 0) {
    groupedValues.push([{ text: { content: '' } }]);
  }

  return groupedValues;
};

export const shouldFilterAiValue = (item: AIChatItemValueItemType) => {
  if (item.hideInUI) return true;
  if (item.text?.content?.trim() || item.reasoning?.content?.trim()) return false;
  if (!item.text && !item.reasoning) return false;

  return !(
    item.tools?.length ||
    item.tool ||
    item.skills?.length ||
    item.interactive ||
    item.plan ||
    item.planStatus ||
    item.agentPlanUpdate ||
    item.agentAsk ||
    item.contextCheckpoint ||
    item.workflowBuilderVersion ||
    item.chatAgentBuilderVersion
  );
};

/**
 * 判断 AI 气泡是否需要展示“应用无输出内容”兜底提示。
 *
 * `isChatting` 是 ChatBox 级别的全局状态，历史消息在下一轮生成时也会收到 true。
 * 因此只能在当前气泡自身是最后一条且正在生成时隐藏提示，避免历史空输出提示被后续发送误隐藏。
 */
export const shouldShowNoOutputTip = ({
  obj,
  status,
  isLastValueGroup,
  isLastChild,
  isChatting,
  shouldWaitCurrentChatStatus,
  hasError,
  hasValidContent
}: {
  obj: `${ChatRoleEnum}`;
  status: `${ChatStatusEnum}`;
  isLastValueGroup: boolean;
  isLastChild: boolean;
  isChatting: boolean;
  shouldWaitCurrentChatStatus: boolean;
  hasError: boolean;
  hasValidContent: boolean;
}) =>
  obj === ChatRoleEnum.AI &&
  status === ChatStatusEnum.finish &&
  isLastValueGroup &&
  !(isLastChild && isChatting) &&
  !shouldWaitCurrentChatStatus &&
  !hasError &&
  !hasValidContent;
