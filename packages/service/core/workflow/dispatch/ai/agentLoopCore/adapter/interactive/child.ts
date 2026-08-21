import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { AgentLoopChildrenInteractiveParams } from '../../../../../../ai/llm/agentLoop/interface';

/**
 * 将 workflow `toolChildrenInteractive` 恢复为 agent-loop 的 child interactive 入参。
 * 新版交互只持久化 toolCallId，完整 messages 从 chat history 转回的 transcript 中恢复。
 * 若旧历史仍带 memoryRequestMessages，则优先使用旧快照，保证历史交互可继续恢复。
 */
export const createAgentLoopCoreChildInteractiveParams = <
  TChildrenResponse = WorkflowInteractiveResponseType
>({
  lastInteractive
}: {
  lastInteractive?: WorkflowInteractiveResponseType;
}): AgentLoopChildrenInteractiveParams<TChildrenResponse> | undefined => {
  if (lastInteractive?.type !== 'toolChildrenInteractive') return;
  const legacyMemoryRequestMessages = lastInteractive.params.toolParams.memoryRequestMessages;

  return {
    childrenResponse: lastInteractive.params.childrenResponse as TChildrenResponse,
    toolParams: {
      toolCallId: lastInteractive.params.toolParams.toolCallId,
      ...(legacyMemoryRequestMessages?.length
        ? {
            memoryRequestMessages: legacyMemoryRequestMessages
          }
        : {})
    }
  };
};
