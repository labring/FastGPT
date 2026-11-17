import type { AgentLoopRuntime } from '../../../../../../ai/llm/agentLoop/interface';
import type {
  AgentLoopCoreToolProvider,
  AgentLoopCoreToolRunResult
} from '../../domain/toolProvider';
import { normalizeAgentLoopCoreToolRunResult } from '../../domain/toolProvider';
import {
  isModerationBlockErrorMessage,
  MODERATION_BLOCKED_REPLACE_TEXT
} from '@fastgpt/global/core/plugin/moderation/constants';
import {
  checkToolResultModeration,
  isToolResultModerated,
  markToolResultModerated,
  sanitizeModeratedToolNodeResponse
} from '../../../../../../plugin/moderation/modelInput';
import type { CheckContentByPolicyParams } from '@fastgpt/global/core/plugin/moderation/type';

export type CreateAgentLoopCoreToolRuntimeParams<TChildrenResponse = unknown> = {
  toolProvider: AgentLoopCoreToolProvider<unknown, TChildrenResponse>;
  batchToolSize?: number;
  context?: CheckContentByPolicyParams['context'];
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
  context,
  onToolResult,
  normalizeInteractiveUsages
}: CreateAgentLoopCoreToolRuntimeParams<TChildrenResponse>): Pick<
  AgentLoopRuntime<TChildrenResponse>,
  'toolCatalog' | 'executeTool' | 'executeInteractiveTool'
> => {
  // 统一普通工具与交互工具的结果审核及敏感字段脱敏，避免两处入口规则分叉
  const moderateToolRunResult = async (result: AgentLoopCoreToolRunResult<TChildrenResponse>) => {
    if (isToolResultModerated(result) || result.nodeSummary?.hasToolResultModerated) {
      return;
    }

    const originalResponse = result.response;
    const moderatedResponse = originalResponse
      ? await checkToolResultModeration({
          response: originalResponse,
          context
        })
      : originalResponse;
    const hitModeration =
      moderatedResponse !== originalResponse || isModerationBlockErrorMessage(result.errorMessage);
    if (hitModeration) {
      result.response = MODERATION_BLOCKED_REPLACE_TEXT;
      result.errorMessage = undefined;
      result.assistantMessages = [];
      result.assistantResponses = undefined;
      if (result.nodeResponse) {
        result.nodeResponse = sanitizeModeratedToolNodeResponse(result.nodeResponse);
      }
    }
    markToolResultModerated(result);
  };

  return {
    toolCatalog: {
      runtimeTools: toolProvider.buildRuntimeTools(),
      batchToolSize
    },
    executeTool: async ({ call, messages }) => {
      const result = await toolProvider.executeTool({ call, messages });

      await moderateToolRunResult(result);

      onToolResult?.({
        callId: call.id,
        result
      });

      return markToolResultModerated(normalizeAgentLoopCoreToolRunResult(result));
    },
    ...(toolProvider.executeInteractiveTool
      ? {
          executeInteractiveTool: async (params) => {
            const result = await toolProvider.executeInteractiveTool!(params);

            await moderateToolRunResult(result);

            onToolResult?.({ callId: params.call.id, result });

            return markToolResultModerated(
              normalizeAgentLoopCoreToolRunResult({
                ...result,
                usages: normalizeInteractiveUsages
                  ? normalizeInteractiveUsages(result.usages)
                  : result.usages
              })
            );
          }
        }
      : {})
  };
};
