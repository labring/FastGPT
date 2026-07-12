import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

/**
 * 从结构化 assistantResponses 中提取纯文本节点输出。
 * workflow output 只需要文本，但聊天记录仍保留结构化内容。
 */
export const getAgentLoopCorePersistedTextOutput = (
  assistantResponses: AIChatItemValueItemType[]
) =>
  assistantResponses
    .filter((item) => item.text?.content)
    .map((item) => item.text!.content)
    .join('');

/**
 * 将最终文本追加到 assistantResponses。
 * 若事件流已经持久化相同文本，只追加缺失部分，避免刷新后重复显示。
 */
export const appendAgentLoopCoreFinalAssistantResponse = ({
  assistantResponses,
  finalText,
  reasoningText,
  hideReason
}: {
  assistantResponses: AIChatItemValueItemType[];
  finalText?: string;
  reasoningText?: string;
  hideReason?: boolean;
}) => {
  if (!finalText) return;

  const persistedText = getAgentLoopCorePersistedTextOutput(assistantResponses);
  if (finalText === persistedText || persistedText.endsWith(finalText)) return;

  assistantResponses.push({
    ...(reasoningText
      ? {
          reasoning: {
            content: reasoningText
          },
          ...(hideReason ? { hideReason: true } : {})
        }
      : {}),
    text: {
      content: finalText.startsWith(persistedText)
        ? finalText.slice(persistedText.length)
        : finalText
    }
  });
};

/**
 * 生成节点结束态需要的 assistantResponses 和纯文本输出。
 * 调用方传入本轮已收集的 assistantResponses，core 负责补齐最终回答缺失片段并返回节点 output 文本。
 */
export const buildAgentLoopCoreFinalAssistantOutput = ({
  assistantResponses,
  finalText,
  reasoningText,
  hideReason
}: {
  assistantResponses: AIChatItemValueItemType[];
  finalText?: string;
  reasoningText?: string;
  hideReason?: boolean;
}) => {
  appendAgentLoopCoreFinalAssistantResponse({
    assistantResponses,
    finalText,
    reasoningText,
    hideReason
  });

  return {
    assistantResponses,
    answerText: getAgentLoopCorePersistedTextOutput(assistantResponses)
  };
};
