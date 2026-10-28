import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { AgentLoopChildrenInteractiveParams } from '../../../../../../ai/llm/agentLoop/interface';

/**
 * 将 workflow `toolChildrenInteractive` 恢复为 agent-loop 的 child interactive 入参。
 * 只读取 toolCallId，完整 messages 从 ChatItem 重建；旧快照字段安全忽略。
 */
export const createAgentLoopCoreChildInteractiveParams = <
  TChildrenResponse = WorkflowInteractiveResponseType
>({
  lastInteractive
}: {
  lastInteractive?: WorkflowInteractiveResponseType;
}): AgentLoopChildrenInteractiveParams<TChildrenResponse> | undefined => {
  if (lastInteractive?.type !== 'toolChildrenInteractive') return;
  return {
    childrenResponse: lastInteractive.params.childrenResponse as TChildrenResponse,
    toolParams: {
      toolCallId: lastInteractive.params.toolParams.toolCallId
    }
  };
};

/** 只有真正的工作流工具生成父调用包装；Loop 对该状态保持不透明。 */
export const createWorkflowToolInteractive = ({
  interactive,
  toolCallId
}: {
  interactive?: WorkflowInteractiveResponseType;
  toolCallId: string;
}): WorkflowInteractiveResponseType | undefined =>
  interactive
    ? {
        type: 'toolChildrenInteractive',
        params: { childrenResponse: interactive, toolParams: { toolCallId } },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      }
    : undefined;
