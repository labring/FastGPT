import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';

export type AgentLoopToolCatalog = {
  runtimeTools: ChatCompletionTool[];
  askTool?: ChatCompletionTool;
  updatePlanTool?: ChatCompletionTool;
};

/**
 * 从 OpenAI function tool 中读取工具名，供冲突检测和 profile 分配复用。
 */
const getToolName = (tool?: ChatCompletionTool) => tool?.function.name;

/**
 * 规范化工具目录。
 * runtimeTools 中如果出现内部工具同名项，会被移除并返回 warning，避免模型误把内部控制工具当业务工具调用。
 */
export const normalizeToolCatalog = (catalog: AgentLoopToolCatalog): AgentLoopToolCatalog => {
  const internalToolNames = new Set(
    [catalog.askTool, catalog.updatePlanTool]
      .map(getToolName)
      .filter((name): name is string => !!name)
  );

  return {
    ...catalog,
    runtimeTools: catalog.runtimeTools.filter((tool) => !internalToolNames.has(tool.function.name))
  };
};

/**
 * 单主 loop 的工具可见性。
 * Main Agent 同时看到业务 runtime tools、ask_agent 和 update_plan；内部工具由 unified loop 拦截。
 */
export const getToolsForUnifiedLoop = ({
  catalog
}: {
  catalog: AgentLoopToolCatalog;
}): ChatCompletionTool[] => {
  const normalized = normalizeToolCatalog(catalog);

  return [
    ...normalized.runtimeTools,
    ...(normalized.askTool ? [normalized.askTool] : []),
    ...(normalized.updatePlanTool ? [normalized.updatePlanTool] : [])
  ];
};
