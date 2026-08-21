import type { AgentLoopRuntime } from '../../../../../../ai/llm/agentLoop/interface';
import type {
  AgentLoopCoreToolProvider,
  AgentLoopCoreToolRunResult
} from '../../domain/toolProvider';
import { normalizeAgentLoopCoreToolRunResult } from '../../domain/toolProvider';

export type CreateAgentLoopCoreToolRuntimeParams<TChildrenResponse = unknown> = {
  toolProvider: AgentLoopCoreToolProvider<unknown, TChildrenResponse>;
  batchToolSize?: number;
  onToolResult?: (args: {
    callId: string;
    result: AgentLoopCoreToolRunResult<TChildrenResponse>;
  }) => void;
  normalizeInteractiveUsages?: (
    usages: AgentLoopCoreToolRunResult<TChildrenResponse>['usages']
  ) => AgentLoopCoreToolRunResult<TChildrenResponse>['usages'];
};

/**
 * 将 workflow 侧 ToolProvider 适配成 agent-loop runtime 的工具字段。
 *
 * 这里只生成 toolCatalog、executeTool、executeInteractiveTool 三个字段；
 * LLM 参数、systemTools、usagePush、emitEvent 仍由调用方按节点语义组装。
 */
export const createAgentLoopCoreToolRuntime = <TChildrenResponse = unknown>({
  toolProvider,
  batchToolSize,
  onToolResult,
  normalizeInteractiveUsages
}: CreateAgentLoopCoreToolRuntimeParams<TChildrenResponse>): Pick<
  AgentLoopRuntime<TChildrenResponse>,
  'toolCatalog' | 'executeTool' | 'executeInteractiveTool'
> => {
  return {
    toolCatalog: {
      runtimeTools: toolProvider.buildRuntimeTools(),
      batchToolSize
    },
    executeTool: async ({ call, messages }) => {
      const result = await toolProvider.executeTool({ call, messages });
      onToolResult?.({
        callId: call.id,
        result
      });

      return normalizeAgentLoopCoreToolRunResult(result);
    },
    ...(toolProvider.executeInteractiveTool
      ? {
          executeInteractiveTool: async (params) => {
            const result = await toolProvider.executeInteractiveTool!(params);

            return normalizeAgentLoopCoreToolRunResult({
              ...result,
              usages: normalizeInteractiveUsages
                ? normalizeInteractiveUsages(result.usages)
                : result.usages
            });
          }
        }
      : {})
  };
};
