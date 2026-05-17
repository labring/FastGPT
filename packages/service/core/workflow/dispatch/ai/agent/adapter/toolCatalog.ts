import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import {
  createAskAgentTool,
  createUpdatePlanTool,
  type AgentLoopToolCatalog
} from '../../../../../ai/llm/agentLoop';

/**
 * 从 workflow completion tool 中读取 function name。
 */
const getToolName = (tool?: ChatCompletionTool) => tool?.function.name;

/**
 * 将 workflow 节点提供的 completionTools 拆分为业务工具和 agent-loop 内部工具。
 * 单主 loop 只保留业务 runtime tools，并注入 ask_agent / update_plan 两个内部工具。
 */
export const createWorkflowAgentLoopToolCatalog = ({
  completionTools
}: {
  completionTools: ChatCompletionTool[];
}): AgentLoopToolCatalog => {
  return {
    runtimeTools: completionTools,
    askTool: createAskAgentTool(),
    updatePlanTool: createUpdatePlanTool()
  };
};

/**
 * 返回 workflow 侧需要隐藏的内部工具名集合，用于过滤前端 SSE 工具事件。
 */
export const getWorkflowAgentLoopInternalToolNames = (catalog: AgentLoopToolCatalog) =>
  new Set(
    [catalog.askTool, catalog.updatePlanTool]
      .map(getToolName)
      .filter((name): name is string => !!name)
  );
