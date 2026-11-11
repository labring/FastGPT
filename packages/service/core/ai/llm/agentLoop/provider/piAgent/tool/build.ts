import type { AgentTool } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import { AgentAskPayloadSchema, type AgentAskPayload } from '@fastgpt/global/core/ai/agent/type';
import { normalizeToolResponseContent } from '@fastgpt/global/core/ai/llm/utils';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  checkToolResultModeration,
  isToolResultModerated,
  markToolResultModerated,
  sanitizeModeratedToolNodeResponse
} from '../../../../../../plugin/moderation/modelInput';
import { checkToolParamsModeration } from '../../../../../../plugin/moderation/output';
import {
  isModerationBlockErrorMessage,
  MODERATION_BLOCKED_REPLACE_TEXT
} from '@fastgpt/global/core/plugin/moderation/constants';
import { createAskUserAgentTool } from '../../../domain/systemTool/ask';
import {
  applyPlanUpdate,
  applySetPlan,
  createPlanAgentTools,
  setPlanToolName
} from '../../../domain/systemTool/plan';
import { createReadFilesTool } from '../../../domain/systemTool/readFile';
import { createAgentLoopSandboxTools, toSandboxToolName } from '../../../domain/systemTool/sandbox';
import {
  createDatasetSearchTool,
  patchDatasetSearchParams
} from '../../../domain/systemTool/datasetSearch';
import {
  normalizeAgentLoopUsages,
  type AgentLoopAssistantResponse,
  type AgentLoopEvent,
  type AgentLoopRuntime,
  type AgentLoopUsage
} from '../../../domain';
import { runSandboxTools } from '../../../../../sandbox/application/toolCall';
import { createToolCall, normalizeToolArgs, stringifyJson } from '../message';
import { getPiAgentRuntimeTools } from './catalog';
import { sanitizeToolParametersForModel } from '@fastgpt/global/common/jsonSchema/utils';

type PlanOperationEvent = Extract<AgentLoopEvent, { type: 'plan_operation' }>;

const getPlanOperation = ({
  toolName,
  args
}: {
  toolName: string;
  args: unknown;
}): PlanOperationEvent['operation'] => {
  if (toolName === setPlanToolName) return 'set_plan';
  if (args && typeof args === 'object' && 'updates' in args && Array.isArray(args.updates)) {
    return 'update_steps';
  }
  return 'add_steps';
};

const pushAgentLoopUsages = <TChildrenResponse = unknown>(
  runtime: AgentLoopRuntime<TChildrenResponse>,
  usages?: Array<AgentLoopUsage | undefined>
) => {
  const normalizedUsages = normalizeAgentLoopUsages(usages);
  if (normalizedUsages.length > 0) runtime.usagePush?.(normalizedUsages);
};

/** pi-ai 会把工具参数原样交给模型供应商，需在进入 agent loop 前统一清理内部字段。 */
const toPiToolParameters = (parameters: unknown) =>
  Type.Unsafe<any>((sanitizeToolParametersForModel(parameters) as Record<string, unknown>) ?? {});

/**
 * 将统一 runtime tools 和 piAgent 支持的系统工具转换为 pi-agent-core AgentTool。
 * 普通工具统一发 tool 生命周期事件；plan 保留领域展示并补齐隐藏的结束事件，供运行时统计活动。
 * Ask 仍通过交互事件暂停，不改变其确认与恢复协议。
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
  onToolResult,
  isToolCallParamsAllowed
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
    continuationMessage?: string;
  }) => void;
  isToolCallParamsAllowed?: (call: ChatCompletionMessageToolCall) => Promise<boolean>;
}): Promise<AgentTool[]> => {
  const tools: AgentTool[] = [];

  const checkParamsAllowed = async (call: ChatCompletionMessageToolCall): Promise<boolean> => {
    if (isToolCallParamsAllowed) {
      return isToolCallParamsAllowed(call);
    }
    const paramCheck = await checkToolParamsModeration({
      toolCalls: [call],
      context: { teamId: runtime.teamId }
    });
    return paramCheck.isPass;
  };

  /** 保证每个普通工具 start 都对应 end，并将异常变成可回填模型的工具结果。 */
  const executeOrdinaryTool = async ({
    call,
    execute
  }: {
    call: ChatCompletionMessageToolCall;
    execute: () => Promise<{
      response: string;
      assistantMessages?: ChatCompletionMessageParam[];
      assistantResponses?: AgentLoopAssistantResponse[];
      usages?: AgentLoopUsage[];
      interactive?: TChildrenResponse;
      stop?: boolean;
      errorMessage?: string;
      metadata?: unknown;
      hideInUI?: boolean;
      continuationMessage?: string;
    }>;
  }) => {
    // 工具参数违规时不派发原始敏感参数、不执行底层工具，直接向 Agent Loop 回填统一审核结果
    const isParamsAllowed = await checkParamsAllowed(call);
    if (!isParamsAllowed) {
      const maskedCall: ChatCompletionMessageToolCall = {
        ...call,
        function: {
          ...call.function,
          arguments: '{}'
        }
      };
      onToolCall(maskedCall);
      runtime.emitEvent?.({
        type: 'tool_run_end',
        call: maskedCall,
        response: MODERATION_BLOCKED_REPLACE_TEXT,
        assistantMessages: [],
        usages: [],
        seconds: 0
      });
      onToolResult({
        call: maskedCall,
        response: MODERATION_BLOCKED_REPLACE_TEXT,
        assistantMessages: []
      });
      return {
        response: MODERATION_BLOCKED_REPLACE_TEXT,
        assistantMessages: [],
        usages: []
      };
    }

    const startedAt = Date.now();
    onToolCall(call);
    runtime.emitEvent?.({ type: 'tool_run_start', call });

    const result = await (async () => {
      try {
        return await execute();
      } catch (error) {
        const errText = getErrText(error);
        if (isModerationBlockErrorMessage(errText)) {
          return {
            response: MODERATION_BLOCKED_REPLACE_TEXT,
            assistantMessages: [],
            usages: []
          };
        }
        const errorMessage = `Tool error: ${errText}`;
        return { response: errorMessage, assistantMessages: [], usages: [], errorMessage };
      }
    })();

    if (!isToolResultModerated(result)) {
      const originalResponse = result.response;
      const moderatedResponse = originalResponse
        ? await checkToolResultModeration({
            response: originalResponse,
            context: { teamId: runtime.teamId }
          })
        : originalResponse;
      const hitModeration =
        moderatedResponse !== originalResponse ||
        isModerationBlockErrorMessage(result.errorMessage);
      if (hitModeration) {
        result.response = MODERATION_BLOCKED_REPLACE_TEXT;
        result.errorMessage = undefined;
        result.assistantMessages = [];
        result.assistantResponses = undefined;
        if (result.metadata && typeof result.metadata === 'object') {
          result.metadata = sanitizeModeratedToolNodeResponse(
            result.metadata as ChatHistoryItemResType
          );
        }
      }
      markToolResultModerated(result);
    }
    const normalizedResponse = normalizeToolResponseContent(result.response);
    const assistantMessages = result.assistantMessages ?? [];
    const usages = normalizeAgentLoopUsages(result.usages);
    pushAgentLoopUsages(runtime, usages);
    if (result.interactive)
      runtime.emitEvent?.({ type: 'tool_interactive', call, interactive: result.interactive });
    runtime.emitEvent?.({
      type: 'tool_run_end',
      call,
      response: normalizedResponse,
      assistantMessages,
      assistantResponses: result.assistantResponses,
      usages,
      errorMessage: result.errorMessage,
      metadata: result.metadata,
      hideInUI: result.hideInUI,
      seconds: +((Date.now() - startedAt) / 1000).toFixed(2)
    });
    onToolResult({
      call,
      response: normalizedResponse,
      assistantMessages,
      ...(!result.interactive &&
        !result.stop && { continuationMessage: result.continuationMessage })
    });
    return { ...result, response: normalizedResponse, assistantMessages, usages };
  };

  for (const tool of getPiAgentRuntimeTools(runtime)) {
    const toolName = tool.function.name;
    tools.push({
      name: toolName,
      label: toolName,
      description: tool.function.description || '',
      parameters: tool.function.parameters
        ? toPiToolParameters(tool.function.parameters)
        : Type.Object({}, { additionalProperties: false }),
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
    for (const planTool of createPlanAgentTools()) {
      tools.push({
        name: planTool.function.name,
        label: planTool.function.name,
        description: planTool.function.description || '',
        parameters: toPiToolParameters(planTool.function.parameters),
        execute: async (callId: string, args: unknown) => {
          const toolArgs = normalizeToolArgs(args);
          const call = createToolCall({
            id: callId,
            name: planTool.function.name,
            args: toolArgs
          });
          const isAllowed = await checkParamsAllowed(call);
          if (!isAllowed) {
            onToolResult({
              call: createToolCall({ id: callId, name: planTool.function.name, args: {} }),
              response: MODERATION_BLOCKED_REPLACE_TEXT
            });
            return {
              content: [{ type: 'text' as const, text: MODERATION_BLOCKED_REPLACE_TEXT }],
              details: {}
            };
          }
          const params = stringifyJson(toolArgs);
          const isSetPlan = planTool.function.name === setPlanToolName;
          runtime.emitEvent?.({
            type: 'plan_status',
            status: isSetPlan ? 'generating' : 'updating'
          });
          const result = isSetPlan
            ? applySetPlan({ input: toolArgs })
            : applyPlanUpdate({ plan: getActivePlan(), update: toolArgs });
          const operation = getPlanOperation({
            toolName: planTool.function.name,
            args: toolArgs
          });
          if (result.success) {
            setActivePlan(result.plan);
            runtime.emitEvent?.({
              type: 'plan_operation',
              operation,
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
              operation,
              success: false,
              message: result.message,
              id: callId,
              params,
              seconds: 0
            });
          }
          onToolResult({
            call,
            response: result.message
          });
          // 与 FastAgent 的计划工具保持一致；展示仍由 plan_operation 负责，避免重复工具卡。
          runtime.emitEvent?.({
            type: 'tool_run_end',
            call,
            response: result.message,
            seconds: 0,
            hideInUI: true
          });
          return { content: [{ type: 'text' as const, text: result.message }], details: {} };
        }
      });
    }
  }

  const askSystemTool = runtime.systemTools?.ask;
  if (askSystemTool?.enabled) {
    const askTool = createAskUserAgentTool();
    tools.push({
      name: askTool.function.name,
      label: askTool.function.name,
      description: askTool.function.description || '',
      parameters: toPiToolParameters(askTool.function.parameters),
      execute: async (callId: string, args: unknown) => {
        const toolArgs = normalizeToolArgs(args);
        const rawCall = createToolCall({ id: callId, name: askTool.function.name, args: toolArgs });
        const isAllowed = await checkParamsAllowed(rawCall);
        if (!isAllowed) {
          onToolResult({
            call: createToolCall({ id: callId, name: askTool.function.name, args: {} }),
            response: MODERATION_BLOCKED_REPLACE_TEXT
          });
          return {
            content: [{ type: 'text' as const, text: MODERATION_BLOCKED_REPLACE_TEXT }],
            details: {}
          };
        }
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

        const validationError = await askSystemTool.validate?.(parsed.data);
        if (validationError) {
          onToolResult({
            call: createToolCall({ id: callId, name: askTool.function.name, args: toolArgs }),
            response: validationError
          });
          return { content: [{ type: 'text' as const, text: validationError }], details: {} };
        }

        setPendingAsk(parsed.data, callId);
        runtime.emitEvent?.({
          type: 'tool_interactive',
          call: createToolCall({ id: callId, name: askTool.function.name, args: toolArgs }),
          interactive: { type: 'agentAsk', params: { toolCallId: callId, arguments: params } }
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

  const sandbox = runtime.systemTools?.sandbox;
  if (sandbox?.enabled) {
    for (const sandboxTool of createAgentLoopSandboxTools()) {
      const agentLoopToolName = sandboxTool.function.name;
      const sandboxToolName = toSandboxToolName(agentLoopToolName);
      tools.push({
        name: agentLoopToolName,
        label: agentLoopToolName,
        description: sandboxTool.function.description || '',
        parameters: toPiToolParameters(sandboxTool.function.parameters),
        execute: async (callId: string, args: unknown) => {
          const call = createToolCall({
            id: callId,
            name: agentLoopToolName,
            args: normalizeToolArgs(args)
          });
          const result = await executeOrdinaryTool({
            call,
            execute: async () => {
              const sandboxResult = await runSandboxTools({
                toolName: sandboxToolName,
                args: call.function.arguments ?? '',
                sandboxClient: sandbox.client,
                validate: sandbox.validate
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
    const readFileTool = createReadFilesTool({
      maxFileAmount: runtime.systemTools.readFile.maxFileAmount
    });
    tools.push({
      name: readFileTool.function.name,
      label: readFileTool.function.name,
      description: readFileTool.function.description || '',
      parameters: toPiToolParameters(readFileTool.function.parameters),
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
      parameters: toPiToolParameters(datasetSearchTool.function.parameters),
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
