import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import {
  createAskUserAgentTool,
  createUpdatePlanAgentTool
} from '../../../../../ai/llm/agentLoop/systemTools';

export type WorkflowAgentLoopToolCatalog = {
  runtimeTools: ChatCompletionTool[];
  askTool: ChatCompletionTool;
  updatePlanTool: ChatCompletionTool;
};

/**
 * 从 workflow completion tool 中读取 function name。
 */
const getToolName = (tool?: ChatCompletionTool) => tool?.function.name;

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

/**
 * 返回 workflow 侧需要隐藏的内部工具名集合，用于过滤前端 SSE 工具事件。
 */
export const getWorkflowAgentLoopInternalToolNames = (catalog: WorkflowAgentLoopToolCatalog) =>
  new Set(
    [catalog.askTool, catalog.updatePlanTool]
      .map(getToolName)
      .filter((name): name is string => !!name)
  );
