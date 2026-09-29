import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { getErrResponse } from '@fastgpt/global/common/error/utils';

/** 判断发送失败是否因为同一个会话已有服务端生成任务。 */
export const isChatGeneratingError = (error: unknown) => {
  const errorResponse = getErrResponse(error);

  return (
    errorResponse === ChatErrEnum.chatIsGenerating ||
    errorResponse?.statusText === ChatErrEnum.chatIsGenerating ||
    errorResponse?.message === ChatErrEnum.chatIsGenerating
  );
};

/** 仅恢复本轮发送实际消费过的输入；已有响应内容时避免重复回填。 */
export const shouldRestoreSubmittedChatInput = ({
  clearInput,
  responseText
}: {
  clearInput: boolean;
  responseText?: unknown;
}) => clearInput && !responseText;

/**
 * 安全中断 AbortController。
 *
 * 职责与设计原因：
 * - 统一封装 controller?.abort(reason) 调用，防御浏览器原生实现（如 Chromium Blink）、
 *   事件流库（如 @fortaine/fetch-event-source）或监听器在销毁期间抛出的 AbortError（如
 *   "signal is aborted without reason"），避免同步异常阻断组件销毁或页面重置流程。
 * - 只有未被 abort 的 controller 才会触发 abort，避免无意义的重复调用。
 *
 * 输入约定：
 * - `controller`：需要中断的目标 AbortController，支持 undefined/null。
 * - `reason`：可选的中断原因。
 */
export const safeAbortController = (controller?: AbortController | null, reason?: unknown) => {
  if (!controller || controller.signal.aborted) return;
  try {
    controller.abort(reason);
  } catch {}
};
