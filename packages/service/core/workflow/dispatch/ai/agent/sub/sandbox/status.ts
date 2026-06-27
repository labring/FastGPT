import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { WorkflowResponseType } from '../../../../type';
import { getRunningSandboxId } from '../../../../../../ai/sandbox/runtime/id';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

/**
 * 发送 Agent 对话中的 sandbox runtime 准备状态。
 *
 * 这里仅负责 UI 侧的粗粒度提示，不参与 sandbox 资源状态流转。
 */
export const streamAgentSandboxInitStatus = ({
  workflowStreamResponse,
  sourceType,
  sourceId,
  userId,
  chatId
}: {
  workflowStreamResponse?: WorkflowResponseType;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
}) => {
  const effectiveSandboxId = getRunningSandboxId({
    sourceType,
    sourceId,
    userId,
    chatId
  });

  workflowStreamResponse?.({
    event: SseResponseEventEnum.sandboxStatus,
    data: {
      sandboxId: effectiveSandboxId,
      phase: 'lazyInit'
    }
  });
};
