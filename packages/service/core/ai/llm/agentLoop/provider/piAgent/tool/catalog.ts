import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { createAskUserAgentTool } from '../../../domain/systemTool/ask';
import { createPlanAgentTools } from '../../../domain/systemTool/plan';
import { createReadFilesTool } from '../../../domain/systemTool/readFile';
import { createAgentLoopSandboxTools } from '../../../domain/systemTool/sandbox';
import { createDatasetSearchTool } from '../../../domain/systemTool/datasetSearch';
import type { AgentLoopRuntime } from '../../../domain';

const getPiAgentSystemTools = <TChildrenResponse = unknown>(
  runtime: AgentLoopRuntime<TChildrenResponse>
): ChatCompletionTool[] => [
  ...(runtime.systemTools?.plan?.enabled ? createPlanAgentTools() : []),
  ...(runtime.systemTools?.ask?.enabled ? [createAskUserAgentTool()] : []),
  ...(runtime.systemTools?.sandbox?.enabled && runtime.systemTools.sandbox.client
    ? createAgentLoopSandboxTools()
    : []),
  ...(runtime.systemTools?.readFile?.enabled
    ? [createReadFilesTool({ maxFileAmount: runtime.systemTools.readFile.maxFileAmount })]
    : []),
  ...(runtime.systemTools?.datasetSearch?.enabled ? [createDatasetSearchTool()] : [])
];

/** 过滤与系统工具重名的业务工具，避免 pi-agent-core 注册重复名称。 */
export const getPiAgentRuntimeTools = <TChildrenResponse = unknown>(
  runtime: AgentLoopRuntime<TChildrenResponse>
): ChatCompletionTool[] => {
  const internalToolNames = new Set(
    getPiAgentSystemTools(runtime).map((tool) => tool.function.name)
  );
  return runtime.toolCatalog.runtimeTools.filter(
    (tool) => !internalToolNames.has(tool.function.name)
  );
};

/** 返回消息修复需要识别的完整工具 schema 集合。 */
export const getPiAgentNormalizationTools = <TChildrenResponse = unknown>(
  runtime: AgentLoopRuntime<TChildrenResponse>
): ChatCompletionTool[] => [...getPiAgentRuntimeTools(runtime), ...getPiAgentSystemTools(runtime)];
