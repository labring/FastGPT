import {
  ToolCallChildrenInteractiveSchema,
  type WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { AgentLoopChildrenInteractiveParams } from '../../../../../../ai/llm/agentLoop/interface';

/**
 * 将 workflow `toolChildrenInteractive` 恢复为 agent-loop 的 child interactive 入参。
 * 新旧包装在 Schema 边界统一为 toolCallId；无效旧记录跳过，完整 messages 从 ChatItem 重建。
 */
export const createAgentLoopCoreChildInteractiveParams = <
  TChildrenResponse = WorkflowInteractiveResponseType
>({
  lastInteractive
}: {
  lastInteractive?: WorkflowInteractiveResponseType;
}): AgentLoopChildrenInteractiveParams<TChildrenResponse> | undefined => {
  if (lastInteractive?.type !== 'toolChildrenInteractive') return;
  const parsed = ToolCallChildrenInteractiveSchema.safeParse(lastInteractive);
  if (!parsed.success) return;
  return {
    childrenResponse: parsed.data.params.childrenResponse as TChildrenResponse,
    toolCallId: parsed.data.params.toolCallId
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
        params: { childrenResponse: interactive, toolCallId },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      }
    : undefined;
