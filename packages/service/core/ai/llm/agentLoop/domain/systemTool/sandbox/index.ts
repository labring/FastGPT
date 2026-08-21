import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { SANDBOX_TOOLS, sandboxToolMap } from '@fastgpt/global/core/ai/sandbox/tools';

export type AgentLoopSandboxToolExecutionParams = {
  id: string;
  toolName: string;
  params?: unknown;
};

export type AgentLoopSandboxToolExecutionResult = {
  response: string;
  error?: unknown;
};

export type AgentLoopSandboxTool = ChatCompletionTool;

/**
 * 返回注入给 LLM 的 sandbox 工具名。
 *
 * sandbox 由 agent-loop 内部拦截执行，但对模型暴露时仍使用 `sandbox_*`
 * 原始名称，避免 prompt 和 tools schema 出现两套名字。
 */
export const toAgentLoopSandboxToolName = (toolName: string) => toolName;

/**
 * 从 agent-loop sandbox 工具名还原出 sandbox 底层工具名。当前两者都使用原始 `sandbox_*` 名称。
 */
export const toSandboxToolName = (toolName: string) => toolName;

/**
 * 判断工具名是否是 sandbox 底层支持的原始工具名。
 */
export const isSandboxToolName = (toolName: string) => toolName in sandboxToolMap;

/**
 * 判断工具名是否是 agent-loop 注入的 sandbox 内置工具。
 *
 * 该判断用于 provider 区分内置工具和业务工具，避免 sandbox 工具继续走外部 executeTool。
 */
export const isAgentLoopSandboxToolName = (toolName: string) =>
  isSandboxToolName(toSandboxToolName(toolName));

/**
 * 将单个 sandbox tool schema 包装为 agent-loop 内置工具 schema。
 */
export const createAgentLoopSandboxTool = (tool: ChatCompletionTool): AgentLoopSandboxTool => ({
  ...tool,
  function: {
    ...tool.function,
    name: toAgentLoopSandboxToolName(tool.function.name)
  }
});

/**
 * 创建本轮可注入 LLM 的全部 sandbox 内置工具 schema。
 */
export const createAgentLoopSandboxTools = (): AgentLoopSandboxTool[] =>
  SANDBOX_TOOLS.map(createAgentLoopSandboxTool);

/**
 * 获取全部 sandbox 内置工具名，供 adapter 或 provider 做过滤和事件映射。
 */
export const getAgentLoopSandboxToolNames = () =>
  createAgentLoopSandboxTools().map((tool) => tool.function.name);
