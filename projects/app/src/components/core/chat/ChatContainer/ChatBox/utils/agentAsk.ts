import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import {
  isAskInteractive,
  extractDeepestInteractive
} from '@fastgpt/global/core/workflow/runtime/utils';
import {
  groupAIChatResponseValues,
  hasAiAnswerContent,
  hasAiProcessingContent
} from '../components/AIChatBubble/utils';

export type AIChatDisplayGroup = { type: 'ai'; values: AIChatItemValueItemType[] };

/**
 * 按交互边界拆分 AI 记录，Ask 和方案确认的回复均由独立 user 记录承载。
 *
 * 各段沿用普通 AI 分组，提问仅由底部输入区展示，方案仍保留 Mermaid 和说明正文。
 * 恢复生成但尚未收到新事件时保留空的 AI 占位，供加载提示使用。
 */
export const getAIChatDisplayGroups = ({
  chatValue,
  isLastChild,
  isChatting
}: {
  chatValue: AIChatItemValueItemType[];
  isLastChild: boolean;
  isChatting: boolean;
}): AIChatDisplayGroup[] => {
  /** 只隐藏问答交互本身，混合 value 的正文、思考和工具输出仍按原样展示。 */
  const isReplyInteractive = (value: AIChatItemValueItemType) => {
    if (value.hideInUI || !value.interactive) return false;

    const interactive = extractDeepestInteractive(value.interactive);
    return isAskInteractive(interactive);
  };

  const groups: AIChatDisplayGroup[] = [];
  let segment: AIChatItemValueItemType[] = [];
  let hasReplyBoundary = false;

  /** 每段沿用原有 AI 分组，滤掉只有 Ask 的空白气泡，保留恢复生成的占位。 */
  const flushSegment = (isLastSegment: boolean) => {
    groupAIChatResponseValues({
      chatValue: segment,
      isLastChild: isLastSegment && isLastChild,
      isChatting
    }).forEach((values) => {
      const hasVisibleContent = values.some(
        (value) =>
          !value.hideInUI &&
          (hasAiAnswerContent(value) ||
            hasAiProcessingContent(value) ||
            value.workflowBuilderVersion ||
            value.chatAgentBuilderVersion ||
            (value.interactive &&
              (!isReplyInteractive(value) ||
                extractDeepestInteractive(value.interactive)?.type === 'workflowBuilderPreview')))
      );
      if (!hasVisibleContent && (!isLastSegment || hasReplyBoundary)) return;
      groups.push({ type: 'ai', values });
    });
    segment = [];
  };

  chatValue.forEach((value) => {
    segment.push(value);
    if (!isReplyInteractive(value)) return;

    flushSegment(false);
    hasReplyBoundary = true;
  });

  if (segment.length > 0 || !hasReplyBoundary) {
    flushSegment(true);
  }

  return groups;
};
