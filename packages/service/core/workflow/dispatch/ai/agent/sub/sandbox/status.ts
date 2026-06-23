import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '../../../../../../ai/skill/edit/config';
import type { WorkflowResponseType } from '../../../../type';

/**
 * 发送 Agent 对话中的 sandbox runtime 准备状态。
 *
 * 这里仅负责 UI 侧的粗粒度提示，不参与 sandbox 资源状态流转。
 */
export const streamAgentSandboxInitStatus = ({
  workflowStreamResponse,
  appId,
  userId,
  chatId,
  sandboxId
}: {
  workflowStreamResponse?: WorkflowResponseType;
  appId: string;
  userId: string;
  chatId: string;
  sandboxId?: string;
}) => {
  const effectiveSandboxId =
    sandboxId ||
    generateSandboxId(appId, chatId === EDIT_DEBUG_SANDBOX_CHAT_ID ? '' : userId, chatId);

  workflowStreamResponse?.({
    event: SseResponseEventEnum.sandboxStatus,
    data: {
      sandboxId: effectiveSandboxId,
      phase: 'lazyInit'
    }
  });
};
