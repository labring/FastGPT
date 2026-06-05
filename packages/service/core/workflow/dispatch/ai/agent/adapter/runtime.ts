import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import {
  normalizeAgentLoopUsages,
  type AgentLoopEvent,
  type AgentLoopRuntime
} from '../../../../../ai/llm/agentLoop';
import { AgentNodeResponseDisplay } from '../../../../../ai/llm/agentLoop/constants';
import { getExecuteTool, type ToolDispatchContext } from '../sub/utils';
import type { WorkflowResponseType } from '../../../type';
import { createWorkflowAgentLoopEventMapper } from './eventMapper';
import {
  createWorkflowAgentLoopToolCatalog,
  getWorkflowAgentLoopInternalToolNames
} from './toolCatalog';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useToolNodeResponse } from './useToolNodeResponse';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { dispatchFileRead } from '../sub/file';
import { ReadFilesToolParamsSchema } from '../../../../../ai/llm/agentLoop/systemTools/readFile';
import { parseJsonArgs } from '../../../../../ai/utils';
import type { SandboxClient } from '../../../../../ai/sandbox/service/runtime';
import type { UseUserContextResult } from './userContext';

type WorkflowAgentLoopRuntimeContext = ToolDispatchContext & {
  node: {
    nodeId: string;
    flowNodeType: FlowNodeTypeEnum;
  };
  filesMap: UseUserContextResult['filesMap'];
  sandboxClient?: SandboxClient;
};

type WorkflowAgentLoopRuntimeArtifacts = {
  assistantResponses: AIChatItemValueItemType[];
  nodeResponses: ChatHistoryItemResType[];
};

type LLMRequestEndEvent = Extract<AgentLoopEvent, { type: 'llm_request_end' }>;
type AfterMessageCompressEvent = Extract<AgentLoopEvent, { type: 'after_message_compress' }>;
type MessageCompressNodeResponseInput = Omit<AfterMessageCompressEvent, 'type'>;

const getFirstAgentLoopUsage = (event: { usages?: ChatNodeUsageType[] }) =>
  normalizeAgentLoopUsages(event.usages)[0];

/**
 * 将 workflow dispatch 上下文适配成通用 AgentLoopRuntime。
 * 这里集中处理工具目录、事件映射、usage 推送和运行详情收集，让 agentLoop 不依赖 workflow 结构。
 *
 * agentLoop 只认识模型、工具和事件；workflow 还需要额外维护：
 * 1. 前端流式事件：由 eventMapper 把 agentLoop 事件转成 workflowStreamResponse。
 * 2. 聊天内容：assistantResponses 记录可展示/可持久化的交互内容。
 * 3. 运行详情：nodeResponses 平铺记录主模型、工具、plan、压缩模型调用的消耗和 requestId。
 */
export const createWorkflowAgentLoopRuntime = ({
  context,
  usagePush,
  workflowStreamResponse,
  assistantResponses = [],
  nodeResponses = [],
  executeToolFactory = getExecuteTool
}: {
  context: WorkflowAgentLoopRuntimeContext;
  usagePush: (usages: ChatNodeUsageType[]) => void;
  workflowStreamResponse?: WorkflowResponseType;
  assistantResponses?: AIChatItemValueItemType[];
  nodeResponses?: ChatHistoryItemResType[];
  executeToolFactory?: typeof getExecuteTool;
}): {
  runtime: AgentLoopRuntime;
  artifacts: WorkflowAgentLoopRuntimeArtifacts;
} => {
  // 工具目录只在 workflow adapter 层生成，agentLoop 后续只依赖通用 toolCatalog。
  const toolCatalog = createWorkflowAgentLoopToolCatalog({
    completionTools: context.completionTools
  });
  // 内置工具需要在事件映射时特殊处理，例如 update_plan / ask_user 不应按普通业务工具展示。
  const internalToolNames = getWorkflowAgentLoopInternalToolNames(toolCatalog);

  // artifacts 是本次 Agent 节点运行结束后要回写给 workflow/chat 层的结果容器。
  // assistantResponses 和 nodeResponses 允许外部传入，是为了继续复用已有数组并保持引用稳定。
  const artifacts: WorkflowAgentLoopRuntimeArtifacts = {
    assistantResponses,
    nodeResponses
  };

  // eventMapper 只负责把 agentLoop 事件翻译成前端可消费的 workflow stream 事件；
  // 本文件在 emitEvent 中先收集持久化数据，再把原始事件交给 mapper。
  const eventMapper = createWorkflowAgentLoopEventMapper({
    workflowStreamResponse,
    getSubAppInfo: context.getSubAppInfo,
    internalToolNames,
    updatePlanToolName: toolCatalog.updatePlanTool?.function.name,
    askToolName: toolCatalog.askTool?.function.name,
    showReasoning: context.params.aiChatReasoning !== false,
    assistantResponses
  });

  // executeToolFactory 默认来自 workflow 工具调度器，测试可注入 mock。
  const executeTool = executeToolFactory(context);
  const {
    cacheToolResult,
    appendToolNodeResponse,
    appendPlanOperationNodeResponse,
    appendAskNodeResponse
  } = useToolNodeResponse({
    node: context.node,
    nodeResponses: artifacts.nodeResponses,
    toolCatalog,
    getSubAppInfo: context.getSubAppInfo
  });

  // 主模型每轮结束后都记录一条运行详情。
  // 即使本轮没有文本、reasoning 或工具调用，也保留 requestId 和 usage，方便排查空响应与计费。
  // 被 stop gate 打回的 assistant message 会在 agentLoop 内从最终 assistantMessages 移除，
  // 但这里仍保留它对应的 nodeResponse，方便前端完整展示模型中间过程。
  const appendAgentCallNodeResponse = (event: LLMRequestEndEvent) => {
    const usage = getFirstAgentLoopUsage(event);
    const agentResponse: ChatHistoryItemResType = {
      id: `${context.node.nodeId}-${event.requestIndex}-${event.requestId}`,
      nodeId: `${context.node.nodeId}-main_agent-${event.requestIndex}`,
      moduleName: AgentNodeResponseDisplay.master.moduleName,
      moduleType: context.node.flowNodeType,
      moduleLogo: AgentNodeResponseDisplay.master.moduleLogo,
      runningTime: event.seconds,
      model: event.modelName,
      llmRequestIds: [event.requestId],
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      totalPoints: usage?.totalPoints,
      finishReason: event.finishReason || (event.error ? 'error' : undefined),
      textOutput: event.answerText,
      reasoningText: event.reasoningText,
      ...(event.error ? { errorText: getErrText(event.error) } : {})
    };
    artifacts.nodeResponses.push(agentResponse);
  };
  const appendMessageCompressNodeResponse = (event: MessageCompressNodeResponseInput) => {
    // Message 压缩是独立内部 LLM 调用，需要作为顶层运行详情展示。
    const createMessageCompressNodeResponse = (
      event: MessageCompressNodeResponseInput
    ): ChatHistoryItemResType => {
      const requestIds = event.requestIds.filter((requestId): requestId is string => !!requestId);
      const responseId = requestIds[0] || getNanoid();
      const usage = getFirstAgentLoopUsage(event);

      return {
        id: responseId,
        nodeId: responseId,
        moduleName: AgentNodeResponseDisplay.contextCompress.moduleName,
        moduleType: context.node.flowNodeType,
        moduleLogo: AgentNodeResponseDisplay.contextCompress.moduleLogo,
        runningTime: event.seconds,
        model: usage?.model,
        llmRequestIds: requestIds.length ? requestIds : undefined,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        totalPoints: usage?.totalPoints
      };
    };
    const nodeResponse = createMessageCompressNodeResponse(event);
    artifacts.nodeResponses.push(nodeResponse);
  };
  const pushAgentLoopUsages = (usages?: ChatNodeUsageType[]) => {
    const normalizedUsages = normalizeAgentLoopUsages(usages);
    if (normalizedUsages.length > 0) {
      usagePush(normalizedUsages);
    }
  };

  return {
    artifacts,
    runtime: {
      llmParams: {
        model: context.params.model,
        reasoningEffort: context.params.aiChatReasoningEffort,
        userKey: context.externalProvider.openaiAccount,
        stream: context.stream,
        temperature: context.params.temperature,
        maxTokens: context.params.maxToken,
        topP: context.params.aiChatTopP,
        stop: context.params.aiChatStopSign,
        responseFormat: {
          type: context.params.aiChatResponseFormat,
          json_schema: context.params.aiChatJsonSchema
        },
        useVision: context.params.aiChatVision,
        useAudio: context.params.aiChatAudio,
        useVideo: context.params.aiChatVideo,
        extractFiles: context.params.aiChatExtractFiles
      },
      responseParams: {
        retainDatasetCite: context.retainDatasetCite
      },
      lang: context.lang,
      systemTools: {
        plan: {
          enabled: true
        },
        ask: {
          enabled: true
        },
        ...(context.sandboxClient
          ? {
              sandbox: {
                enabled: true,
                client: context.sandboxClient
              }
            }
          : {}),
        ...(Object.keys(context.filesMap).length > 0
          ? {
              readFile: {
                enabled: true,
                execute: async ({ call }) => {
                  const rawArgs = parseJsonArgs(call.function.arguments);
                  const toolParams = ReadFilesToolParamsSchema.safeParse(rawArgs);
                  if (!toolParams.success) {
                    return {
                      response: toolParams.error.message,
                      usages: []
                    };
                  }

                  const files = toolParams.data.ids.map((id) => {
                    const file = context.filesMap[id];

                    return {
                      id,
                      ...(file?.name ? { name: file.name } : {}),
                      url: file?.url || ''
                    };
                  });
                  const startTime = Date.now();
                  const result = await dispatchFileRead({
                    files,
                    teamId: context.runningUserInfo.teamId,
                    tmbId: context.runningUserInfo.tmbId,
                    customPdfParse: context.chatConfig?.fileSelectConfig?.customPdfParse
                  });

                  return {
                    response: result.response,
                    usages: result.usages ?? [],
                    nodeResponse: result.nodeResponse
                      ? {
                          ...result.nodeResponse,
                          id: call.id,
                          nodeId: call.id,
                          runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
                          totalPoints: normalizeAgentLoopUsages(result.usages).reduce(
                            (sum, item) => sum + item.totalPoints,
                            0
                          )
                        }
                      : undefined
                  };
                }
              }
            }
          : {})
      },
      checkIsStopping: context.checkIsStopping,
      toolCatalog: {
        runtimeTools: toolCatalog.runtimeTools,
        batchToolSize: 5
      },
      executeTool: async ({ call }) => {
        // agentLoop 传入标准 tool call；workflow 工具调度器需要 callId/toolId/args。
        // 工具 nodeResponse 等 tool_run_end 事件到达后统一写入，避免提前缺少压缩 child。
        const result = await executeTool({
          callId: call.id,
          toolId: call.function.name,
          args: call.function.arguments
        });

        cacheToolResult({
          callId: call.id,
          usages: result.usages ?? [],
          nodeResponse: result.nodeResponse
        });

        return {
          response: result.response,
          assistantMessages: [],
          usages: result.usages ?? [],
          stop: result.stop
        };
      },
      usagePush: pushAgentLoopUsages,
      emitEvent: (event) => {
        // 事件处理顺序有意保持为：先收集后端持久化需要的运行详情，再推给前端。
        // 这样即使前端事件映射逻辑变化，也不影响 chat record 的运行数据完整性。
        if (event.type === 'llm_request_end') {
          appendAgentCallNodeResponse(event);
        }
        if (event.type === 'after_message_compress') {
          appendMessageCompressNodeResponse(event);
        }
        if (event.type === 'tool_run_end') {
          appendToolNodeResponse(event);
        }
        if (event.type === 'plan_operation') {
          appendPlanOperationNodeResponse(event);
        }
        if (event.type === 'ask_start') {
          appendAskNodeResponse(event);
        }
        eventMapper.emitEvent(event);
      }
    }
  };
};
