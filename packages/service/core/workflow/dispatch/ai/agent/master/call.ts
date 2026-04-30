import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import { runAgentLoop } from '../../../../../ai/llm/agentLoop';
import { chats2GPTMessages, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { addFilePrompt2Input } from '../sub/file/utils';
import { type AgentStepItemType } from '@fastgpt/global/core/ai/agent/type';
import type { GetSubAppInfoFnType, SubAppRuntimeType } from '../type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { DispatchAgentModuleProps } from '..';
import { getLLMModel } from '../../../../../ai/model';
import { getStepCallQuery, getStepDependon } from './dependon';
import { getOneStepResponseSummary } from './responseSummary';
import type { DispatchPlanAgentResponse } from '../sub/plan';
import type { WorkflowResponseItemType } from '../../../type';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { i18nT } from '../../../../../../../web/i18n/utils';
import { getMasterSystemPrompt } from './prompt';
import { filterMemoryMessages } from '../../utils';
import type { CapabilityToolCallHandlerType } from '../capability/type';
import { getExecuteTool } from '../utils';

type Response = {
  stepResponse?: {
    rawResponse: string;
    summary: string;
  };
  planResponse?: DispatchPlanAgentResponse;
  completeMessages: ChatCompletionMessageParam[];
  assistantMessages: ChatCompletionMessageParam[];
  masterMessages: ChatCompletionMessageParam[];
  capabilityAssistantResponses?: AIChatItemValueItemType[];

  nodeResponse: ChatHistoryItemResType;
};

export const masterCall = async ({
  systemPrompt,
  masterMessages,
  planMessages,
  getSubAppInfo,
  getSubApp,
  completionTools,
  filesMap,
  steps,
  step,
  capabilityToolCallHandler,
  ...props
}: DispatchAgentModuleProps & {
  masterMessages: ChatCompletionMessageParam[];
  planMessages: ChatCompletionMessageParam[];
  systemPrompt?: string;

  getSubAppInfo: GetSubAppInfoFnType;
  getSubApp: (id: string) => SubAppRuntimeType | undefined;
  completionTools: ChatCompletionTool[];
  filesMap: Record<string, string>;

  // Step call
  steps?: AgentStepItemType[];
  step?: AgentStepItemType;

  // Capability tool call handler
  capabilityToolCallHandler?: CapabilityToolCallHandlerType;
}): Promise<Response> => {
  const {
    checkIsStopping,
    chatConfig,
    runningUserInfo,
    runningAppInfo,
    chatId,
    uid,
    variables,
    externalProvider,
    stream,
    workflowStreamResponse,
    usagePush,
    params: {
      model,
      // Dataset search configuration
      agent_datasetParams: datasetParams,
      // Sandbox (Computer Use)
      useAgentSandbox = false,
      aiChatVision
    }
  } = props;

  const startTime = Date.now();
  const childrenResponses: ChatHistoryItemResType[] = [];
  const capabilityAssistantResponses: AIChatItemValueItemType[] = [];
  const isStepCall = steps && step;
  const stepId = step?.id;
  const stepStreamResponse = (args: WorkflowResponseItemType) => {
    return workflowStreamResponse?.({
      stepId,
      ...args
    });
  };

  // StepCall 暂时不支持二次 plan
  if (isStepCall) {
    completionTools = completionTools.filter((item) => item.function.name !== SubAppIds.plan);
  }

  const { requestMessages } = await (async () => {
    if (isStepCall) {
      // Get depends on step ids
      const getDependonResult = await (async () => {
        if (!step.depends_on) {
          const {
            depends,
            usage: dependsUsage,
            nodeResponse
          } = await getStepDependon({
            checkIsStopping,
            model,
            steps,
            step
          });
          if (dependsUsage) {
            usagePush([dependsUsage]);
          }

          step.depends_on = depends;
          return { nodeResponse };
        }
      })();
      const getDependonNodeResponse = getDependonResult?.nodeResponse;

      // Step call system prompt
      const callQuery = await getStepCallQuery({
        checkIsStopping,
        steps,
        step,
        model,
        filesMap
      });
      if (callQuery.usage) {
        usagePush([callQuery.usage]);
        if (getDependonNodeResponse) {
          getDependonNodeResponse.compressTextAgent = {
            inputTokens: callQuery.usage.inputTokens || 0,
            outputTokens: callQuery.usage.outputTokens || 0,
            totalPoints: callQuery.usage.totalPoints
          };
        }
      }

      if (getDependonNodeResponse) {
        childrenResponses.push(getDependonNodeResponse);
      }

      const requestMessages = chats2GPTMessages({
        messages: [
          {
            obj: ChatRoleEnum.Human,
            value: runtimePrompt2ChatsValue({
              text: addFilePrompt2Input({ query: callQuery.prompt }),
              files: []
            })
          }
        ],
        reserveId: false
      });

      return { requestMessages };
    }

    // Calculate if user has available tools (exclude plan tool)
    const hasUserTools =
      completionTools.filter((tool) => tool.function.name !== SubAppIds.plan).length > 0;

    // Get history messages
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system' as const,
        content: getMasterSystemPrompt({
          systemPrompt,
          hasUserTools,
          useAgentSandbox: useAgentSandbox && !!global.feConfigs?.show_agent_sandbox,
          hasSandboxSkills: !!capabilityToolCallHandler
        })
      },
      ...masterMessages
    ];
    return {
      requestMessages: messages
    };
  })();

  let planResult: DispatchPlanAgentResponse | undefined;

  const executeTool = getExecuteTool({
    ...props,
    streamResponseFn: stepStreamResponse,
    getSubAppInfo,
    getSubApp,
    completionTools,
    filesMap,
    capabilityToolCallHandler
  });

  const {
    model: agentModel,
    assistantMessages,
    completeMessages,
    inputTokens,
    outputTokens,
    llmTotalPoints,
    childrenUsages,
    finish_reason,
    requestIds,
    error: agentError
  } = await runAgentLoop({
    maxRunAgentTimes: 100,
    body: {
      messages: requestMessages,
      model: getLLMModel(model),
      stream: true,
      useVision: aiChatVision,
      tools: isStepCall
        ? completionTools.filter((item) => item.function.name !== SubAppIds.plan)
        : completionTools
    },

    userKey: externalProvider.openaiAccount,
    usagePush,
    isAborted: checkIsStopping,
    // childrenInteractiveParams

    onReasoning({ text }) {
      stepStreamResponse?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          reasoning_content: text
        })
      });
    },
    onStreaming({ text }) {
      stepStreamResponse?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text
        })
      });
    },
    onToolCall({ call }) {
      const subApp = getSubAppInfo(call.function.name);

      if (call.function.name === SubAppIds.plan) {
        return;
      }

      stepStreamResponse?.({
        id: call.id,
        event: SseResponseEventEnum.toolCall,
        data: {
          tool: {
            id: call.id,
            toolName: subApp?.name || call.function.name,
            toolAvatar: subApp?.avatar || '',
            functionName: call.function.name,
            params: call.function.arguments ?? ''
          }
        }
      });
    },
    onToolParam({ call, argsDelta }) {
      stepStreamResponse?.({
        id: call.id,
        event: SseResponseEventEnum.toolParams,
        data: {
          tool: {
            params: argsDelta
          }
        }
      });
    },
    onAfterCompressContext: ({ modelName, inputTokens, outputTokens, totalPoints, seconds }) => {
      childrenResponses.push({
        nodeId: getNanoid(6),
        id: getNanoid(6),
        moduleType: FlowNodeTypeEnum.emptyNode,
        moduleName: i18nT('chat:compress_llm_messages'),
        moduleLogo: 'core/app/agent/child/contextCompress',
        model: modelName,
        inputTokens,
        outputTokens,
        totalPoints,
        runningTime: seconds
      });
    },
    onRunTool: async ({ call }) => {
      const toolId = call.function.name;
      const callId = call.id;

      const {
        response,
        usages = [],
        stop = false,
        nodeResponse,
        planResult: execPlanResult,
        capabilityAssistantResponses: execCapabilityAssistantResponses
      } = await executeTool({ callId, toolId, args: call.function.arguments });

      // 赋值操作
      {
        if (execPlanResult) {
          planResult = execPlanResult;
        }
        if (execCapabilityAssistantResponses) {
          capabilityAssistantResponses.push(...execCapabilityAssistantResponses);
        }
        if (nodeResponse) {
          childrenResponses.push(nodeResponse);
        }
        // Push stream response
        stepStreamResponse?.({
          id: call.id,
          event: SseResponseEventEnum.toolResponse,
          data: {
            tool: {
              response
            }
          }
        });
      }

      return {
        response,
        assistantMessages: [],
        usages,
        stop
      };
    },
    onAfterToolResponseCompress: ({ call, response, usage }) => {
      const callId = call.id;
      const nodeResponse = childrenResponses.findLast((item) => item.id === callId);
      if (nodeResponse) {
        nodeResponse.compressTextAgent = usage;
        nodeResponse.totalPoints = nodeResponse.totalPoints
          ? nodeResponse.totalPoints + usage.totalPoints
          : usage.totalPoints;
        nodeResponse.toolRes = response;
      }
    },
    onRunInteractiveTool: async ({}) => {
      return {
        response: 'Interactive tool not supported',
        assistantMessages: [], // TODO
        usages: []
      };
    }
  });

  // llmTotalPoints 是 runAgentLoop 内每次 LLM 调用单独计价后的累计值，保证梯度计费正确
  const llmUsage = {
    modelName: getLLMModel(agentModel).name,
    totalPoints: llmTotalPoints
  };
  const childTotalPoints = childrenUsages.reduce((sum, item) => sum + item.totalPoints, 0);
  const nodeResponse: ChatHistoryItemResType = {
    nodeId: getNanoid(6),
    id: getNanoid(6),
    moduleType: FlowNodeTypeEnum.agent,
    moduleName: isStepCall ? i18nT('chat:step_call') : i18nT('chat:master_agent_call'),
    model: llmUsage.modelName,
    moduleLogo: isStepCall ? 'core/app/agent/child/stepCall' : 'core/app/type/agentFill',
    ...(agentError && { errorText: getErrText(agentError) }),
    inputTokens,
    outputTokens,
    totalPoints: childTotalPoints + llmUsage.totalPoints,
    childrenResponses,
    finishReason: finish_reason,
    llmRequestIds: requestIds,

    // Step params
    stepQuery: step?.title
  };

  // Step call
  if (isStepCall && !checkIsStopping()) {
    const answerText = assistantMessages
      .map((item) => {
        if (item.role === 'assistant' && item.content) {
          if (typeof item.content === 'string') {
            return item.content;
          } else {
            return item.content
              .map((content) => (content.type === 'text' ? content.text : ''))
              .join('\n');
          }
        }
        return '';
      })
      .join('\n');

    // Get step response summary
    const {
      answerText: summary,
      usage: summaryUsage,
      nodeResponse: summaryNodeResponse
    } = await getOneStepResponseSummary({
      checkIsStopping,
      response: answerText,
      model
    });
    summaryUsage && usagePush([summaryUsage]);
    summaryNodeResponse && nodeResponse.childrenResponses?.push(summaryNodeResponse);
    // 更新 stepCall 的运行时间
    nodeResponse.runningTime = +((Date.now() - startTime) / 1000).toFixed(2);

    return {
      stepResponse: {
        rawResponse: answerText,
        summary
      },
      completeMessages,
      assistantMessages,
      nodeResponse,
      masterMessages: masterMessages.concat(assistantMessages),
      capabilityAssistantResponses
    };
  }

  nodeResponse.runningTime = +((Date.now() - startTime) / 1000).toFixed(2);
  // Default
  return {
    planResponse: planResult,
    completeMessages,
    assistantMessages,
    nodeResponse,
    masterMessages: filterMemoryMessages(completeMessages),
    capabilityAssistantResponses
  };
};
