import json5 from 'json5';
import { Agent, type AgentEvent, type AgentMessage } from '@mariozechner/pi-agent-core';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getLLMSupportParams, removeDatasetCiteText } from '@fastgpt/global/core/ai/llm/utils';
import { formatModelChars2Points } from '../../../../../../support/wallet/usage/utils';
import { getLLMModel } from '../../../../model';
import { computedMaxToken, computedTemperature } from '../../../../utils';
import { AgentUsageModuleName } from '../../constants';
import {
  AgentAskPayloadSchema,
  createAskUserAgentTool,
  type AgentAskPayload
} from '../../systemTools/ask';
import { applyPlanUpdate, createUpdatePlanAgentTool } from '../../systemTools/plan';
import { createReadFilesTool } from '../../systemTools/readFile';
import { createAgentLoopSandboxTools, toSandboxToolName } from '../../systemTools/sandbox';
import { normalizeAgentLoopUsages } from '../../type';
import type { AgentLoopEvent, AgentLoopInput, AgentLoopResult, AgentLoopRuntime } from '../../type';
import type { AgentLoopProvider } from '../type';
import { buildPiModel, getModelApiKey, getPiThinkingLevel } from './modelBridge';
import { type AssistantMessage, type StopReason, type ToolCall, Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { getSandboxToolInfo, runSandboxTools } from '../../../../sandbox/toolCall';

export type PiAgentProviderState = {
  piMessages?: AgentMessage[];
  activePlan?: AgentPlanType;
  pendingAsk?: AgentAskPayload;
  pendingAskId?: string;
};

const stringifyJson = (value: unknown) => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
};

const normalizeToolArgs = (args: unknown): Record<string, any> =>
  args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, any>) : {};

const pushAgentLoopUsages = <TChildrenResponse = unknown>(
  runtime: AgentLoopRuntime<TChildrenResponse>,
  usages?: Array<ChatNodeUsageType | undefined>
) => {
  const normalizedUsages = normalizeAgentLoopUsages(usages);
  if (normalizedUsages.length > 0) {
    runtime.usagePush?.(normalizedUsages);
  }
};

const getMessageText = (message?: ChatCompletionMessageParam) => {
  if (!message || !('content' in message) || !message.content) return '';
  if (typeof message.content === 'string') return message.content;
  return message.content.map((item) => (item.type === 'text' ? item.text : '')).join('');
};

const getPromptFromMessages = (messages: ChatCompletionMessageParam[]) => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === ChatCompletionRequestMessageRoleEnum.User) {
      return getMessageText(message);
    }
  }
  return '';
};

const getPiAgentPrompt = ({
  messages,
  pendingAsk,
  userAnswer
}: {
  messages: ChatCompletionMessageParam[];
  pendingAsk?: AgentAskPayload;
  userAnswer?: string;
}) => {
  if (!pendingAsk || userAnswer === undefined) {
    return getPromptFromMessages(messages);
  }

  return [
    'Continue the previous pending ask_user with the user answer below.',
    '',
    `<ask_user_question>${pendingAsk.question}</ask_user_question>`,
    pendingAsk.reason ? `<ask_user_reason>${pendingAsk.reason}</ask_user_reason>` : '',
    `<user_answer>${userAnswer}</user_answer>`
  ]
    .filter(Boolean)
    .join('\n');
};

const isAssistantMessage = (message: unknown): message is AssistantMessage =>
  !!message && typeof message === 'object' && (message as { role?: string }).role === 'assistant';

type AssistantContentItem = AssistantMessage['content'][number];
type ToolMatchInfo = {
  properties: Set<string>;
  required: Set<string>;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isEmptyToolArguments = (args: unknown) =>
  !isObjectRecord(args) || Object.keys(args).length === 0;

const isToolCallContent = (item: AssistantContentItem): item is ToolCall =>
  item.type === 'toolCall';

const normalizeResponseFormat = (
  responseFormat?: AgentLoopRuntime['llmParams']['responseFormat']
) => {
  if (!responseFormat?.type) return undefined;
  if (responseFormat.type !== 'json_schema') {
    return {
      type: responseFormat.type
    };
  }

  try {
    return {
      type: 'json_schema',
      json_schema:
        typeof responseFormat.json_schema === 'string'
          ? json5.parse(responseFormat.json_schema)
          : responseFormat.json_schema
    };
  } catch {
    throw new Error('Json schema error');
  }
};

const mergePiAgentPayload = <TChildrenResponse = unknown>({
  payload,
  runtime
}: {
  payload: unknown;
  runtime: AgentLoopRuntime<TChildrenResponse>;
}) => {
  if (!isObjectRecord(payload)) return payload;

  const modelData = getLLMModel(runtime.llmParams.model);
  const supportParams = getLLMSupportParams(modelData);
  const responseFormat = supportParams.responseFormat
    ? normalizeResponseFormat(runtime.llmParams.responseFormat)
    : undefined;
  const stop = supportParams.stop
    ? runtime.llmParams.stop?.split('|').filter((item) => !!item.trim())
    : undefined;
  const maxTokens =
    typeof runtime.llmParams.maxTokens === 'number'
      ? computedMaxToken({
          model: modelData,
          maxToken: runtime.llmParams.maxTokens
        })
      : undefined;
  const temperature =
    supportParams.temperature && typeof runtime.llmParams.temperature === 'number'
      ? computedTemperature({
          model: modelData,
          temperature: runtime.llmParams.temperature
        })
      : undefined;

  return {
    ...payload,
    ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
    ...(typeof temperature === 'number' ? { temperature } : {}),
    ...(supportParams.topP && typeof runtime.llmParams.topP === 'number'
      ? { top_p: runtime.llmParams.topP }
      : {}),
    ...(stop?.length ? { stop } : {}),
    ...(responseFormat ? { response_format: responseFormat } : {})
  };
};

const getToolMatchInfo = (tool: ChatCompletionTool): ToolMatchInfo => {
  const schema = tool.function.parameters as
    | {
        properties?: Record<string, unknown>;
        required?: string[];
      }
    | undefined;

  return {
    properties: new Set(Object.keys(schema?.properties || {})),
    required: new Set(schema?.required || [])
  };
};

const scoreToolArguments = ({
  toolName,
  args,
  toolInfoMap
}: {
  toolName: string;
  args: Record<string, unknown>;
  toolInfoMap: Map<string, ToolMatchInfo>;
}) => {
  const argKeys = Object.keys(args);
  if (argKeys.length === 0) return 0;

  const toolInfo = toolInfoMap.get(toolName);
  if (!toolInfo) return 1;

  const propertyHits = argKeys.filter((key) => toolInfo.properties.has(key)).length;
  const requiredHits = argKeys.filter((key) => toolInfo.required.has(key)).length;
  const hasSchemaKeys = toolInfo.properties.size > 0 || toolInfo.required.size > 0;

  if (hasSchemaKeys && propertyHits === 0 && requiredHits === 0) return -1;

  return propertyHits + requiredHits * 4;
};

const normalizeAssistantToolCalls = ({
  message,
  completionTools = []
}: {
  message: AssistantMessage;
  completionTools?: ChatCompletionTool[];
}) => {
  if (!Array.isArray(message.content)) return;

  const toolInfoMap = new Map(
    completionTools.map((tool) => [tool.function.name, getToolMatchInfo(tool)] as const)
  );
  const normalizedContent: AssistantContentItem[] = [];

  const canMergeIntoToolCall = (
    item: AssistantContentItem,
    args: Record<string, unknown>
  ): item is ToolCall => {
    if (!isToolCallContent(item) || !item.name) return false;

    const score = scoreToolArguments({
      toolName: item.name,
      args,
      toolInfoMap
    });
    if (score < 0) return false;

    // pi-agent-core streaming 可能把 tool name 和 arguments 拆成多个块；空参数命名块优先作为合并目标。
    if (isEmptyToolArguments(item.arguments)) return true;

    return score > 0;
  };

  const findMergeTargetIndex = (args: Record<string, unknown>) => {
    const previousIndex = normalizedContent.length - 1;
    const previousItem = normalizedContent[previousIndex];
    if (previousItem && canMergeIntoToolCall(previousItem, args)) {
      const previousScore = scoreToolArguments({
        toolName: previousItem.name,
        args,
        toolInfoMap
      });
      if (previousScore >= 0) return previousIndex;
    }

    let bestIndex = -1;
    let bestScore = -1;
    normalizedContent.forEach((item, index) => {
      if (!canMergeIntoToolCall(item, args)) return;

      const score = scoreToolArguments({
        toolName: item.name,
        args,
        toolInfoMap
      });
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    return bestIndex;
  };

  for (const item of message.content) {
    if (!isToolCallContent(item)) {
      normalizedContent.push(item);
      continue;
    }

    const toolArguments = isObjectRecord(item.arguments) ? item.arguments : {};
    if (item.name) {
      normalizedContent.push({
        ...item,
        id: item.id || `pi_tool_${getNanoid(8)}`,
        arguments: toolArguments
      });
      continue;
    }

    const mergeTargetIndex = findMergeTargetIndex(toolArguments);
    const target = normalizedContent[mergeTargetIndex];
    if (target && isToolCallContent(target)) {
      normalizedContent[mergeTargetIndex] = {
        ...target,
        arguments: {
          ...(isObjectRecord(target.arguments) ? target.arguments : {}),
          ...toolArguments
        }
      };
    }
  }

  message.content = normalizedContent.filter((item) => !isToolCallContent(item) || !!item.name);
};

export const normalizePiAgentMessages = ({
  messages,
  completionTools = []
}: {
  messages: AgentMessage[];
  completionTools?: ChatCompletionTool[];
}): AgentMessage[] =>
  messages.map((message) => {
    if (!isAssistantMessage(message) || !Array.isArray(message.content)) return message;

    const normalizedMessage: AssistantMessage = {
      ...message,
      content: [...message.content]
    };
    normalizeAssistantToolCalls({
      message: normalizedMessage,
      completionTools
    });

    return normalizedMessage;
  });

const formatToolCalls = (toolCalls: ToolCall[]): ChatCompletionMessageToolCall[] =>
  toolCalls.map((toolCall) => ({
    id: toolCall.id || `pi_tool_${getNanoid(8)}`,
    type: 'function',
    function: {
      name: toolCall.name,
      arguments: stringifyJson(toolCall.arguments)
    }
  }));

const readAssistantMessage = (message: AssistantMessage) => {
  let answerText = '';
  let reasoningText = '';
  const toolCalls: ToolCall[] = [];

  message.content.forEach((item) => {
    if (item.type === 'text') {
      answerText += item.text || '';
      return;
    }
    if (item.type === 'thinking') {
      reasoningText += item.thinking || '';
      return;
    }
    if (item.type === 'toolCall') {
      toolCalls.push(item);
    }
  });

  return {
    answerText,
    reasoningText,
    toolCalls: formatToolCalls(toolCalls)
  };
};

const mapStopReason = (reason?: StopReason): CompletionFinishReason => {
  if (reason === 'toolUse') return 'tool_calls';
  if (reason === 'length') return 'length';
  if (reason === 'error') return 'error';
  if (reason === 'aborted') return 'close';
  return 'stop';
};

const readPiAgentProviderState = (providerState: unknown): PiAgentProviderState => {
  if (!providerState || typeof providerState !== 'object') return {};
  return providerState as PiAgentProviderState;
};

type PlanOperationEvent = Extract<AgentLoopEvent, { type: 'plan_operation' }>;

const getPlanOperationFromArgs = (args: unknown): PlanOperationEvent['operation'] => {
  const action = args && typeof args === 'object' && 'action' in args ? args.action : undefined;

  if (action === 'set_plan' || action === 'add_steps' || action === 'update_steps') {
    return action;
  }

  return 'update_steps';
};

const createToolCall = ({
  id,
  name,
  args
}: {
  id: string;
  name: string;
  args: unknown;
}): ChatCompletionMessageToolCall => ({
  id,
  type: 'function',
  function: {
    name,
    arguments: stringifyJson(args)
  }
});

const getPiAgentSystemTools = <TChildrenResponse = unknown>(
  runtime: AgentLoopRuntime<TChildrenResponse>
): ChatCompletionTool[] => [
  ...(runtime.systemTools?.plan?.enabled ? [createUpdatePlanAgentTool()] : []),
  ...(runtime.systemTools?.ask?.enabled ? [createAskUserAgentTool()] : []),
  ...(runtime.systemTools?.sandbox?.enabled && runtime.systemTools.sandbox.client
    ? createAgentLoopSandboxTools()
    : []),
  ...(runtime.systemTools?.readFile?.enabled ? [createReadFilesTool()] : [])
];

const getPiAgentInternalToolNames = <TChildrenResponse = unknown>(
  runtime: AgentLoopRuntime<TChildrenResponse>
) => new Set(getPiAgentSystemTools(runtime).map((tool) => tool.function.name));

const getPiAgentRuntimeTools = <TChildrenResponse = unknown>(
  runtime: AgentLoopRuntime<TChildrenResponse>
): ChatCompletionTool[] => {
  const internalToolNames = getPiAgentInternalToolNames(runtime);
  return runtime.toolCatalog.runtimeTools.filter(
    (tool) => !internalToolNames.has(tool.function.name)
  );
};

const getPiAgentNormalizationTools = <TChildrenResponse = unknown>(
  runtime: AgentLoopRuntime<TChildrenResponse>
): ChatCompletionTool[] => [...getPiAgentRuntimeTools(runtime), ...getPiAgentSystemTools(runtime)];

const buildPiAgentTools = async <TChildrenResponse = unknown>({
  input,
  runtime,
  getActivePlan,
  setActivePlan,
  setPendingAsk,
  onAskPending
}: {
  input: AgentLoopInput<TChildrenResponse>;
  runtime: AgentLoopRuntime<TChildrenResponse>;
  getActivePlan: () => AgentPlanType | undefined;
  setActivePlan: (plan: AgentPlanType) => void;
  setPendingAsk: (ask: AgentAskPayload, askId: string) => void;
  onAskPending?: () => void;
}): Promise<AgentTool[]> => {
  const tools: AgentTool[] = [];

  for (const tool of getPiAgentRuntimeTools(runtime)) {
    const toolName = tool.function.name;
    tools.push({
      name: toolName,
      label: toolName,
      description: tool.function.description || '',
      parameters: Type.Unsafe<any>((tool.function.parameters as Record<string, unknown>) ?? {}),
      execute: async (callId: string, args: unknown) => {
        const toolArgs = normalizeToolArgs(args);
        const call = createToolCall({
          id: callId,
          name: toolName,
          args: toolArgs
        });
        const startedAt = Date.now();

        runtime.emitEvent?.({ type: 'tool_call', call });
        runtime.emitEvent?.({ type: 'tool_run_start', call });

        const result = await runtime.executeTool({
          call,
          messages: input.messages
        });
        const seconds = +((Date.now() - startedAt) / 1000).toFixed(2);
        pushAgentLoopUsages(runtime, result.usages);

        runtime.emitEvent?.({
          type: 'tool_run_end',
          call,
          rawResponse: result.response,
          response: result.response,
          usages: result.usages,
          seconds
        });

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
        const result = applyPlanUpdate({
          plan: getActivePlan(),
          update: toolArgs
        });
        if (result.success) {
          setActivePlan(result.plan);
          runtime.emitEvent?.({
            type: 'plan_update',
            plan: result.plan
          });
        }
        runtime.emitEvent?.({
          type: 'plan_operation',
          operation: getPlanOperationFromArgs(toolArgs),
          success: result.success,
          message: result.message,
          id: callId,
          params,
          seconds: 0,
          plan: result.success ? result.plan : undefined
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
          return {
            content: [
              {
                type: 'text' as const,
                text: `Invalid ask arguments: ${parsed.error.message}`
              }
            ],
            details: {}
          };
        }

        setPendingAsk(parsed.data, callId);
        runtime.emitEvent?.({
          type: 'ask_start',
          ask: parsed.data,
          id: callId,
          params,
          seconds: 0
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
    const sandboxTools = createAgentLoopSandboxTools();
    for (const sandboxTool of sandboxTools) {
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
          const toolArgs = normalizeToolArgs(args);
          const call = createToolCall({
            id: callId,
            name: agentLoopToolName,
            args: toolArgs
          });
          const startedAt = Date.now();

          runtime.emitEvent?.({ type: 'tool_call', call });
          runtime.emitEvent?.({ type: 'tool_run_start', call });

          if (!runtime.systemTools?.sandbox?.client) {
            const response = 'Sandbox executor is not available.';
            const seconds = +((Date.now() - startedAt) / 1000).toFixed(2);
            runtime.emitEvent?.({
              type: 'tool_run_end',
              call,
              rawResponse: response,
              response,
              usages: [],
              seconds,
              errorMessage: response
            });
            return {
              content: [{ type: 'text' as const, text: response }],
              details: {}
            };
          }

          const result = await runSandboxTools({
            toolName: sandboxToolName,
            args: call.function.arguments ?? '',
            sandboxClient: runtime.systemTools.sandbox.client
          });
          const sandboxInfo = getSandboxToolInfo(sandboxToolName, runtime.lang);
          const seconds = +((Date.now() - startedAt) / 1000).toFixed(2);
          const nodeResponse = {
            id: callId,
            nodeId: callId,
            moduleType: FlowNodeTypeEnum.tool,
            moduleName: sandboxInfo?.name || sandboxToolName,
            moduleLogo: sandboxInfo?.avatar,
            toolId: sandboxToolName,
            toolInput: result.input,
            toolRes: result.response,
            runningTime: seconds
          };
          runtime.emitEvent?.({
            type: 'tool_run_end',
            call,
            rawResponse: result.response,
            response: result.response,
            usages: [],
            seconds,
            errorMessage: result.success ? undefined : result.response,
            nodeResponse
          });

          return {
            content: [{ type: 'text' as const, text: result.response }],
            details: {}
          };
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
        const toolArgs = normalizeToolArgs(args);
        const call = createToolCall({
          id: callId,
          name: readFileTool.function.name,
          args: toolArgs
        });
        const startedAt = Date.now();

        runtime.emitEvent?.({ type: 'tool_call', call });
        runtime.emitEvent?.({ type: 'tool_run_start', call });

        const result = await runtime.systemTools!.readFile!.execute({
          call,
          messages: input.messages
        });
        pushAgentLoopUsages(runtime, result.usages);
        const seconds = +((Date.now() - startedAt) / 1000).toFixed(2);
        runtime.emitEvent?.({
          type: 'tool_run_end',
          call,
          rawResponse: result.response,
          response: result.response,
          usages: result.usages,
          seconds,
          errorMessage: result.error ? getErrText(result.error) : undefined,
          nodeResponse: result.nodeResponse
        });

        return {
          content: [{ type: 'text' as const, text: result.response }],
          details: {}
        };
      }
    });
  }

  return tools;
};

export const runPiAgentLoop = async <TChildrenResponse = unknown>({
  input,
  runtime
}: {
  input: AgentLoopInput<TChildrenResponse>;
  runtime: AgentLoopRuntime<TChildrenResponse>;
}): Promise<AgentLoopResult<TChildrenResponse>> => {
  const state = readPiAgentProviderState(input.providerState);
  const modelName = runtime.llmParams.model;
  const modelData = getLLMModel(modelName);
  const requestIds: string[] = [];
  let requestIndex = 0;
  let answerText = '';
  let reasoningText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let llmTotalPoints = 0;
  let activePlan = input.activePlan ?? state.activePlan;
  let pendingAsk: AgentAskPayload | undefined;
  let pendingAskId: string | undefined;
  let latestError: unknown;
  const abortCurrentRunRef: {
    current?: () => void;
  } = {};
  const normalizationTools = getPiAgentNormalizationTools(runtime);
  const retainDatasetCite = runtime.responseParams?.retainDatasetCite ?? true;

  if (input.userAnswer !== undefined) {
    runtime.emitEvent?.({
      type: 'ask_resume',
      answer: input.userAnswer
    });
  }

  const tools = await buildPiAgentTools({
    input,
    runtime,
    getActivePlan: () => activePlan,
    setActivePlan: (plan) => {
      activePlan = plan;
    },
    setPendingAsk: (ask, askId) => {
      pendingAsk = ask;
      pendingAskId = askId;
    },
    onAskPending: () => abortCurrentRunRef.current?.()
  });

  const pendingRequests: Array<{ requestId: string; requestIndex: number; startedAt: number }> = [];
  const agent = new Agent({
    initialState: {
      systemPrompt: input.systemPrompt || '',
      model: buildPiModel(
        modelName,
        runtime.llmParams.useVision,
        runtime.llmParams.userKey,
        runtime.llmParams.maxTokens
      ),
      thinkingLevel: getPiThinkingLevel(modelName, runtime.llmParams.reasoningEffort),
      tools,
      messages: normalizePiAgentMessages({
        messages: state.piMessages ?? [],
        completionTools: normalizationTools
      })
    },
    getApiKey: () => getModelApiKey(modelName, runtime.llmParams.userKey),
    onPayload: (payload) => {
      const requestId = `pi_${getNanoid(12)}`;
      const nextRequest = {
        requestId,
        requestIndex: ++requestIndex,
        startedAt: Date.now()
      };
      pendingRequests.push(nextRequest);
      requestIds.push(requestId);
      runtime.emitEvent?.({
        type: 'llm_request_start',
        requestIndex: nextRequest.requestIndex,
        modelName: modelData.name
      });
      return mergePiAgentPayload({
        payload,
        runtime
      });
    },
    transformContext: async (messages) =>
      normalizePiAgentMessages({
        messages,
        completionTools: normalizationTools
      })
  });
  abortCurrentRunRef.current = () => agent.abort();

  agent.subscribe((event: AgentEvent) => {
    if (event.type === 'message_update') {
      const assistantEvent = event.assistantMessageEvent;
      if (assistantEvent.type === 'text_delta') {
        answerText += assistantEvent.delta;
        runtime.emitEvent?.({
          type: 'answer_delta',
          text: assistantEvent.delta
        });
        return;
      }
      if (assistantEvent.type === 'thinking_delta') {
        reasoningText += assistantEvent.delta;
        runtime.emitEvent?.({
          type: 'reasoning_delta',
          text: assistantEvent.delta
        });
      }
      return;
    }

    if (event.type === 'message_end' && isAssistantMessage(event.message)) {
      const request = pendingRequests.shift() || {
        requestId: `pi_${getNanoid(12)}`,
        requestIndex: ++requestIndex,
        startedAt: Date.now()
      };
      if (!requestIds.includes(request.requestId)) {
        requestIds.push(request.requestId);
      }

      const [normalizedMessage] = normalizePiAgentMessages({
        messages: [event.message],
        completionTools: normalizationTools
      });
      const assistantMessage = isAssistantMessage(normalizedMessage)
        ? normalizedMessage
        : event.message;
      const messageData = readAssistantMessage(assistantMessage);
      if (!answerText && messageData.answerText) {
        answerText = messageData.answerText;
      }
      if (!reasoningText && messageData.reasoningText) {
        reasoningText = messageData.reasoningText;
      }

      const requestInputTokens = event.message.usage?.input || 0;
      const requestOutputTokens = event.message.usage?.output || 0;
      const totalPoints = runtime.llmParams.userKey?.key
        ? 0
        : formatModelChars2Points({
            model: modelData,
            inputTokens: requestInputTokens,
            outputTokens: requestOutputTokens
          }).totalPoints;
      inputTokens += requestInputTokens;
      outputTokens += requestOutputTokens;
      llmTotalPoints += totalPoints;
      const usage: ChatNodeUsageType = {
        moduleName: AgentUsageModuleName.agentCall,
        model: modelData.name,
        totalPoints,
        inputTokens: requestInputTokens,
        outputTokens: requestOutputTokens
      };
      pushAgentLoopUsages(runtime, [usage]);

      runtime.emitEvent?.({
        type: 'llm_request_end',
        requestIndex: request.requestIndex,
        modelName: modelData.name,
        requestId: request.requestId,
        finishReason: mapStopReason(event.message.stopReason),
        answerText: messageData.answerText,
        reasoningText: messageData.reasoningText,
        toolCalls: messageData.toolCalls,
        usages: [usage],
        seconds: +((Date.now() - request.startedAt) / 1000).toFixed(2),
        error: event.message.errorMessage
      });
      return;
    }

    if (event.type === 'turn_end') {
      const errMsg = (event.message as { errorMessage?: string }).errorMessage;
      if (errMsg) latestError = errMsg;
    }
  });

  const stopPoller = setInterval(() => {
    if (runtime.checkIsStopping?.()) {
      agent.abort();
    }
  }, 200);

  try {
    await agent.prompt(
      getPiAgentPrompt({
        messages: input.messages,
        pendingAsk: state.pendingAsk,
        userAnswer: input.userAnswer
      })
    );
  } catch (error) {
    latestError = error;
  } finally {
    clearInterval(stopPoller);
  }

  const nextProviderState: PiAgentProviderState = {
    piMessages: normalizePiAgentMessages({
      messages: agent.state.messages,
      completionTools: normalizationTools
    }),
    activePlan,
    ...(pendingAsk ? { pendingAsk } : {}),
    ...(pendingAskId ? { pendingAskId } : {})
  };

  if (pendingAsk) {
    runtime.emitEvent?.({
      type: 'ask',
      ask: pendingAsk,
      providerState: nextProviderState
    });

    return {
      status: 'ask',
      ask: pendingAsk,
      askId: pendingAskId,
      activePlan,
      providerState: nextProviderState,
      completeMessages: input.messages,
      assistantMessages: [],
      requestIds,
      usage: {
        inputTokens,
        outputTokens,
        llmTotalPoints
      }
    };
  }

  if (runtime.checkIsStopping?.()) {
    return {
      status: 'aborted',
      answerText: removeDatasetCiteText(answerText, retainDatasetCite),
      reasoningText: removeDatasetCiteText(reasoningText, retainDatasetCite),
      activePlan,
      providerState: nextProviderState,
      completeMessages: input.messages,
      assistantMessages: [],
      requestIds,
      usage: {
        inputTokens,
        outputTokens,
        llmTotalPoints
      }
    };
  }

  if (latestError || agent.state.errorMessage) {
    return {
      status: 'error',
      answerText: removeDatasetCiteText(answerText, retainDatasetCite),
      reasoningText: removeDatasetCiteText(reasoningText, retainDatasetCite),
      activePlan,
      providerState: nextProviderState,
      completeMessages: input.messages,
      assistantMessages: [],
      requestIds,
      usage: {
        inputTokens,
        outputTokens,
        llmTotalPoints
      },
      error: latestError || agent.state.errorMessage
    };
  }

  return {
    status: 'done',
    answerText: removeDatasetCiteText(answerText, retainDatasetCite),
    reasoningText: removeDatasetCiteText(reasoningText, retainDatasetCite),
    activePlan,
    providerState: nextProviderState,
    completeMessages: input.messages,
    assistantMessages: [],
    requestIds,
    usage: {
      inputTokens,
      outputTokens,
      llmTotalPoints
    }
  };
};

export const piAgentProvider: AgentLoopProvider = {
  name: 'piAgent',
  run: runPiAgentLoop
};
