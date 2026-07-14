import type { AgentTool } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import { normalizeToolResponseContent } from '@fastgpt/global/core/ai/llm/utils';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  AgentAskPayloadSchema,
  createAskUserAgentTool,
  type AgentAskPayload
} from '../../../domain/systemTool/ask';
import { applyPlanUpdate, createUpdatePlanAgentTool } from '../../../domain/systemTool/plan';
import { createReadFilesTool } from '../../../domain/systemTool/readFile';
import { createAgentLoopSandboxTools, toSandboxToolName } from '../../../domain/systemTool/sandbox';
import {
  createDatasetSearchTool,
  patchDatasetSearchParams
} from '../../../domain/systemTool/datasetSearch';
import {
  normalizeAgentLoopUsages,
  type AgentLoopEvent,
  type AgentLoopRuntime,
  type AgentLoopUsage
} from '../../../domain';
import { runSandboxTools } from '../../../../../sandbox/interface/toolCall';
import { createToolCall, normalizeToolArgs, stringifyJson } from '../message';
import { getPiAgentRuntimeTools } from './catalog';

type PlanOperationEvent = Extract<AgentLoopEvent, { type: 'plan_operation' }>;

const getPlanOperationFromArgs = (args: unknown): PlanOperationEvent['operation'] => {
  const action = args && typeof args === 'object' && 'action' in args ? args.action : undefined;
  if (action === 'set_plan' || action === 'add_steps' || action === 'update_steps') return action;
  return 'update_steps';
};

const pushAgentLoopUsages = <TChildrenResponse = unknown>(
  runtime: AgentLoopRuntime<TChildrenResponse>,
  usages?: Array<AgentLoopUsage | undefined>
) => {
  const normalizedUsages = normalizeAgentLoopUsages(usages);
  if (normalizedUsages.length > 0) runtime.usagePush?.(normalizedUsages);
};

/**
 * 将统一 runtime tools 和 piAgent 支持的系统工具转换为 pi-agent-core AgentTool。
 * 普通工具统一发 tool 生命周期事件；plan/ask 仅发各自的领域事件。
 */
export const buildPiAgentTools = async <TChildrenResponse = unknown>({
  runtime,
  getActivePlan,
  setActivePlan,
  setPendingAsk,
  onAskPending,
  onToolChildPending,
  onToolStop,
  getMessages,
  onToolCall,
  onToolResult
}: {
  runtime: AgentLoopRuntime<TChildrenResponse>;
  getActivePlan: () => AgentPlanType | undefined;
  setActivePlan: (plan: AgentPlanType) => void;
  setPendingAsk: (ask: AgentAskPayload, askId: string) => void;
  onAskPending?: () => void;
  onToolChildPending?: (pause: { childrenResponse: TChildrenResponse; toolCallId: string }) => void;
  onToolStop?: () => void;
  getMessages: () => ChatCompletionMessageParam[];
  onToolCall: (call: ChatCompletionMessageToolCall) => void;
  onToolResult: (params: {
    call: ChatCompletionMessageToolCall;
    response: string;
    assistantMessages?: ChatCompletionMessageParam[];
  }) => void;
}): Promise<AgentTool[]> => {
  const tools: AgentTool[] = [];

  /** 保证每个普通工具 start 都对应 end，并将异常变成可回填模型的工具结果。 */
  const executeOrdinaryTool = async ({
    call,
    execute
  }: {
    call: ChatCompletionMessageToolCall;
    execute: () => Promise<{
      response: string;
      assistantMessages?: ChatCompletionMessageParam[];
      usages?: AgentLoopUsage[];
      interactive?: TChildrenResponse;
      stop?: boolean;
      errorMessage?: string;
      metadata?: unknown;
    }>;
  }) => {
    const startedAt = Date.now();
    onToolCall(call);
    runtime.emitEvent?.({ type: 'tool_run_start', call });

    const result = await (async () => {
      try {
        return await execute();
      } catch (error) {
        const errorMessage = `Tool error: ${getErrText(error)}`;
        return { response: errorMessage, assistantMessages: [], usages: [], errorMessage };
      }
    })();
    const normalizedResponse = normalizeToolResponseContent(result.response);
    const assistantMessages = result.assistantMessages ?? [];
    const usages = normalizeAgentLoopUsages(result.usages);
    pushAgentLoopUsages(runtime, usages);
    runtime.emitEvent?.({
      type: 'tool_run_end',
      call,
      rawResponse: result.response,
      response: normalizedResponse,
      assistantMessages,
      usages,
      errorMessage: result.errorMessage,
      metadata: result.metadata,
      seconds: +((Date.now() - startedAt) / 1000).toFixed(2)
    });
    onToolResult({ call, response: normalizedResponse, assistantMessages });
    return { ...result, response: normalizedResponse, assistantMessages, usages };
  };

  for (const tool of getPiAgentRuntimeTools(runtime)) {
    const toolName = tool.function.name;
    tools.push({
      name: toolName,
      label: toolName,
      description: tool.function.description || '',
      parameters: Type.Unsafe<any>((tool.function.parameters as Record<string, unknown>) ?? {}),
      execute: async (callId: string, args: unknown) => {
        const call = createToolCall({ id: callId, name: toolName, args: normalizeToolArgs(args) });
        const result = await executeOrdinaryTool({
          call,
          execute: () => runtime.executeTool({ call, messages: [...getMessages()] })
        });
        if (result.interactive) {
          onToolChildPending?.({ childrenResponse: result.interactive, toolCallId: call.id });
        } else if (result.stop) {
          onToolStop?.();
        }
        return { content: [{ type: 'text' as const, text: result.response }], details: {} };
      }
    });
  }

  if (runtime.systemTools?.plan?.enabled) {
    const planTool = createUpdatePlanAgentTool();
    tools.push({
      name: planTool.function.name,
      label: planTool.function.name,
      description: planTool.function.description || '',
      parameters: Type.Unsafe<any>((planTool.function.parameters as Record<string, unknown>) ?? {}),
      execute: async (callId: string, args: unknown) => {
        const toolArgs = normalizeToolArgs(args);
        const params = stringifyJson(toolArgs);
        runtime.emitEvent?.({
          type: 'plan_status',
          status: getActivePlan() ? 'updating' : 'generating'
        });
        const result = applyPlanUpdate({ plan: getActivePlan(), update: toolArgs });
        if (result.success) {
          setActivePlan(result.plan);
          runtime.emitEvent?.({
            type: 'plan_operation',
            operation: getPlanOperationFromArgs(toolArgs),
            success: true,
            message: result.message,
            id: callId,
            params,
            seconds: 0,
            plan: result.plan
          });
        } else {
          runtime.emitEvent?.({
            type: 'plan_operation',
            operation: getPlanOperationFromArgs(toolArgs),
            success: false,
            message: result.message,
            id: callId,
            params,
            seconds: 0
          });
        }
        onToolResult({
          call: createToolCall({ id: callId, name: planTool.function.name, args: toolArgs }),
          response: result.message
        });
        return { content: [{ type: 'text' as const, text: result.message }], details: {} };
      }
    });
  }

  if (runtime.systemTools?.ask?.enabled) {
    const askTool = createAskUserAgentTool();
    tools.push({
      name: askTool.function.name,
      label: askTool.function.name,
      description: askTool.function.description || '',
      parameters: Type.Unsafe<any>((askTool.function.parameters as Record<string, unknown>) ?? {}),
      execute: async (callId: string, args: unknown) => {
        const toolArgs = normalizeToolArgs(args);
        const params = stringifyJson(toolArgs);
        const parsed = AgentAskPayloadSchema.safeParse(toolArgs);
        if (!parsed.success) {
          const response = `Invalid ask arguments: ${parsed.error.message}`;
          onToolResult({
            call: createToolCall({ id: callId, name: askTool.function.name, args: toolArgs }),
            response
          });
          return { content: [{ type: 'text' as const, text: response }], details: {} };
        }

        setPendingAsk(parsed.data, callId);
        runtime.emitEvent?.({
          type: 'ask_start',
          ask: parsed.data,
          id: callId,
          params,
          seconds: 0
        });
        onToolResult({
          call: createToolCall({ id: callId, name: askTool.function.name, args: toolArgs }),
          response: 'Waiting for user answer.'
        });
        onAskPending?.();
        return {
          content: [{ type: 'text' as const, text: 'Waiting for user answer.' }],
          details: {}
        };
      }
    });
  }

  if (runtime.systemTools?.sandbox?.enabled && runtime.systemTools.sandbox.client) {
    for (const sandboxTool of createAgentLoopSandboxTools()) {
      const agentLoopToolName = sandboxTool.function.name;
      const sandboxToolName = toSandboxToolName(agentLoopToolName);
      tools.push({
        name: agentLoopToolName,
        label: agentLoopToolName,
        description: sandboxTool.function.description || '',
        parameters: Type.Unsafe<any>(
          (sandboxTool.function.parameters as Record<string, unknown>) ?? {}
        ),
        execute: async (callId: string, args: unknown) => {
          const call = createToolCall({
            id: callId,
            name: agentLoopToolName,
            args: normalizeToolArgs(args)
          });
          const result = await executeOrdinaryTool({
            call,
            execute: async () => {
              const sandboxClient = runtime.systemTools?.sandbox?.client;
              if (!sandboxClient) {
                const response = 'Sandbox executor is not available.';
                return { response, assistantMessages: [], usages: [], errorMessage: response };
              }
              const sandboxResult = await runSandboxTools({
                toolName: sandboxToolName,
                args: call.function.arguments ?? '',
                sandboxClient
              });
              return {
                response: sandboxResult.response,
                assistantMessages: [],
                usages: [],
                errorMessage: sandboxResult.success ? undefined : sandboxResult.response
              };
            }
          });
          return { content: [{ type: 'text' as const, text: result.response }], details: {} };
        }
      });
    }
  }

  if (runtime.systemTools?.readFile?.enabled) {
    const readFileTool = createReadFilesTool();
    tools.push({
      name: readFileTool.function.name,
      label: readFileTool.function.name,
      description: readFileTool.function.description || '',
      parameters: Type.Unsafe<any>(
        (readFileTool.function.parameters as Record<string, unknown>) ?? {}
      ),
      execute: async (callId: string, args: unknown) => {
        const call = createToolCall({
          id: callId,
          name: readFileTool.function.name,
          args: normalizeToolArgs(args)
        });
        const result = await executeOrdinaryTool({
          call,
          execute: async () => {
            const readFileResult = await runtime.systemTools!.readFile!.execute({
              call,
              messages: [...getMessages()]
            });
            return {
              response: readFileResult.response,
              assistantMessages: [],
              usages: readFileResult.usages,
              errorMessage: readFileResult.error ? getErrText(readFileResult.error) : undefined,
              metadata: readFileResult.metadata
            };
          }
        });
        return { content: [{ type: 'text' as const, text: result.response }], details: {} };
      }
    });
  }

  if (runtime.systemTools?.datasetSearch?.enabled) {
    const datasetSearchTool = createDatasetSearchTool();
    tools.push({
      name: datasetSearchTool.function.name,
      label: datasetSearchTool.function.name,
      description: datasetSearchTool.function.description || '',
      parameters: Type.Unsafe<any>(
        (datasetSearchTool.function.parameters as Record<string, unknown>) ?? {}
      ),
      execute: async (callId: string, args: unknown) => {
        const patchedArgs = patchDatasetSearchParams({
          args: stringifyJson(normalizeToolArgs(args)),
          currentInputFiles: runtime.systemTools?.datasetSearch?.currentInputFiles
        });
        const call = createToolCall({
          id: callId,
          name: datasetSearchTool.function.name,
          args: patchedArgs
        });
        const result = await executeOrdinaryTool({
          call,
          execute: async () => {
            const executeDatasetSearch = runtime.systemTools?.datasetSearch?.execute;
            if (!executeDatasetSearch) {
              const response = 'Dataset search executor is not available.';
              return { response, assistantMessages: [], usages: [], errorMessage: response };
            }
            const datasetResult = await executeDatasetSearch({
              call,
              messages: [...getMessages()]
            });
            return {
              response: datasetResult.response,
              assistantMessages: [],
              usages: datasetResult.usages,
              errorMessage: datasetResult.error ? getErrText(datasetResult.error) : undefined,
              metadata: datasetResult.metadata
            };
          }
        });
        return { content: [{ type: 'text' as const, text: result.response }], details: {} };
      }
    });
  }

  return tools;
};
