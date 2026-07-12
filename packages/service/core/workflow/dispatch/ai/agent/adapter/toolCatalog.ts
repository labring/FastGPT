import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import {
  createAskUserAgentTool,
  createUpdatePlanAgentTool
} from '../../../../../ai/llm/agentLoop/interface';

export type WorkflowAgentLoopToolCatalog = {
  runtimeTools: ChatCompletionTool[];
  askTool: ChatCompletionTool;
  updatePlanTool: ChatCompletionTool;
};

/**
 * 将 workflow 节点提供的 completionTools 拆分为业务工具和 agent-loop 内部工具。
 * workflow agent 入口只传业务 runtime tools；plan/ask/sandbox 等 internal tools 由 provider 自行挂载。
 */
export const createWorkflowAgentLoopToolCatalog = ({
  completionTools
}: {
  completionTools: ChatCompletionTool[];
}): WorkflowAgentLoopToolCatalog => {
  return {
    runtimeTools: completionTools,
    askTool: createAskUserAgentTool(),
    updatePlanTool: createUpdatePlanAgentTool()
  };
};
