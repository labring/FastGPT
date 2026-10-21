import type { AgentAskInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';
import {
  groupAIChatResponseValues,
  hasAiAnswerContent,
  hasAiProcessingContent
} from '../components/AIChatBubble/utils';

export type AIChatDisplayGroup =
  | { type: 'ai'; values: AIChatItemValueItemType[] }
  | { type: 'agentAsk'; interactive: AgentAskInteractive };

/**
 * 按 Ask 边界拆分 AI 记录，把已提交问答投影为用户消息，不改动持久化与续接协议。
 *
 * Ask 仍保留在前一段 AI 的 values 中作为过程分界，避免辅助生成把提问前的中间文本
 * 当成最终正文。恢复生成但尚未收到新事件时，保留边界以显示新的活动处理段。
 */
export const getAIChatDisplayGroups = ({
  chatValue,
  isLastChild,
  isChatting,
  collapseIntermediateAgentResponses
}: {
  chatValue: AIChatItemValueItemType[];
  isLastChild: boolean;
  isChatting: boolean;
  collapseIntermediateAgentResponses: boolean;
}): AIChatDisplayGroup[] => {
  /** 统一新旧及子流程 Ask 的展示结构，历史记录不会恢复为当前可提交交互。 */
  const getAgentAsk = (value: AIChatItemValueItemType): AgentAskInteractive | undefined => {
    if (value.hideInUI || !value.interactive) return;

    const interactive = extractDeepestInteractive(value.interactive);
    if (interactive.type === 'agentAsk') return interactive;
    if (interactive.type !== 'agentPlanAskQuery') return;

    return {
      type: 'agentAsk',
      askId: interactive.askId,
      params: {
        description: interactive.params.reason ?? '',
        questions: [
          {
            question: interactive.params.content,
            options: interactive.params.options.map((option) => ({
              summary: option,
              value: option
            })),
            answer: interactive.params.answer ?? ''
          }
        ],
        submitted: interactive.params.answer !== undefined
      }
    };
  };

  const groups: AIChatDisplayGroup[] = [];
  let segment: AIChatItemValueItemType[] = [];
  let lastAskValue: AIChatItemValueItemType | undefined;
  let lastAskSubmitted = false;

  /** 每段继续使用原有 AI 分组；只有 Ask 边界的空段不创建 AI 气泡。 */
  const flushSegment = (isLastSegment: boolean) => {
    groupAIChatResponseValues({
      chatValue: segment,
      isLastChild: isLastSegment && isLastChild,
      isChatting,
      collapseIntermediateAgentResponses
    }).forEach((values) => {
      const hasVisibleContent = values.some(
        (value) =>
          !value.hideInUI &&
          (hasAiAnswerContent(value) ||
            hasAiProcessingContent(value) ||
            value.workflowBuilderVersion ||
            (value.interactive && !getAgentAsk(value)))
      );
      if (!isLastSegment && !hasVisibleContent) return;
      if (!collapseIntermediateAgentResponses && values.some(getAgentAsk) && !hasVisibleContent) {
        return;
      }

      groups.push({ type: 'ai', values });
    });
    segment = [];
  };

  chatValue.forEach((value) => {
    segment.push(value);
    const interactive = getAgentAsk(value);
    if (!interactive) return;

    flushSegment(false);
    lastAskValue = value;
    // 旧记录未保存 submitted 时沿用历史已结束的兼容判断，跳过也作为一次已提交回答。
    lastAskSubmitted = !!interactive.params.submitted || !isLastChild;
    if (lastAskSubmitted) groups.push({ type: 'agentAsk', interactive });
  });

  if (segment.length > 0 || !lastAskValue) {
    flushSegment(true);
  } else if (isLastChild && isChatting && lastAskSubmitted) {
    segment = [lastAskValue];
    flushSegment(true);
  }

  return groups;
};
