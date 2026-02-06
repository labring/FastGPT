import type { ChatCompletionMessageParam, ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { runAgentCall } from '../../../../../ai/llm/agentCall';
import { chats2GPTMessages, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { addFilePrompt2Input, ReadFileToolSchema } from '../sub/file/utils';
import { type AgentStepItemType } from '@fastgpt/global/core/ai/agent/type';
import type { GetSubAppInfoFnType, SubAppRuntimeType } from '../type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { parseJsonArgs } from '../../../../../ai/utils';
import { dispatchFileRead } from '../sub/file';
import { dispatchTool } from '../sub/tool';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { DatasetSearchToolSchema } from '../sub/dataset/utils';
import { dispatchAgentDatasetSearch } from '../sub/dataset';
import type { DispatchAgentModuleProps } from '..';
import { getLLMModel } from '../../../../../ai/model';
import { getStepCallQuery, getStepDependon } from './dependon';
import { getOneStepResponseSummary } from './responseSummary';
import type { DispatchPlanAgentResponse } from '../sub/plan';
import { dispatchPlanAgent } from '../sub/plan';
import { addLog } from '../../../../../../common/system/log';
import type { WorkflowResponseItemType } from '../../../type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { i18nT } from '../../../../../../../web/i18n/utils';
import { formatModelChars2Points } from '../../../../../../support/wallet/usage/utils';
import { getMasterSystemPrompt } from './prompt';
import { PlanAgentParamsSchema } from '../sub/plan/constants';
import { filterMemoryMessages } from '../../utils';
import { dispatchApp, dispatchPlugin } from '../sub/app';

type Response = {
  stepResponse?: {
    rawResponse: string;
    summary: string;
  };
  planResponse?: DispatchPlanAgentResponse;
  completeMessages: ChatCompletionMessageParam[];
  assistantMessages: ChatCompletionMessageParam[];
  masterMessages: ChatCompletionMessageParam[];

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
  ...props
}: DispatchAgentModuleProps & {
  masterMessages: ChatCompletionMessageParam[];
  planMessages: ChatCompletionMessageParam[];
  systemPrompt?: string;

  getSubAppInfo: GetSubAppInfoFnType;
  getSubApp: (id: string) => SubAppRuntimeType;
  completionTools: ChatCompletionTool[];
  filesMap: Record<string, string>;

  // Step call
  steps?: AgentStepItemType[];
  step?: AgentStepItemType;
}): Promise<Response> => {
  const {
    checkIsStopping,
    chatConfig,
    runningUserInfo,
    runningAppInfo,
    variables,
    externalProvider,
    stream,
    workflowStreamResponse,
    usagePush,
    params: {
      model,
      // Dataset search configuration
      agent_datasetParams: datasetParams
    }
  } = props;

  const startTime = Date.now();
  const childrenResponses: ChatHistoryItemResType[] = [];
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

    console.log('completionTools', completionTools);

    // Get history messages
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system' as const,
        content: getMasterSystemPrompt(systemPrompt, hasUserTools)
      },
      ...masterMessages
    ];
    return {
      requestMessages: messages
    };
  })();

  let planResult: DispatchPlanAgentResponse | undefined;

  const {
    model: agentModel,
    assistantMessages,
    completeMessages,
    inputTokens,
    outputTokens,
    childrenUsages,
    finish_reason,
    requestIds,
    error: agentError
  } = await runAgentCall({
    maxRunAgentTimes: 100,
    body: {
      messages: requestMessages,
      model: getLLMModel(model),
      stream: true,
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
    onToolParam({ tool, params }) {
      stepStreamResponse?.({
        id: tool.id,
        event: SseResponseEventEnum.toolParams,
        data: {
          tool: {
            params
          }
        }
      });
    },
    onCompressContext: ({ modelName, inputTokens, outputTokens, totalPoints, seconds }) => {
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
    handleToolResponse: async ({ call, messages }) => {
      addLog.debug('handleToolResponse', { toolName: call.function.name });
      const toolId = call.function.name;
      const callId = call.id;

      const {
        response,
        usages = [],
        stop = false
      } = await (async () => {
        try {
          if (toolId === SubAppIds.fileRead) {
            const toolParams = ReadFileToolSchema.safeParse(parseJsonArgs(call.function.arguments));
            if (!toolParams.success) {
              return {
                response: toolParams.error.message,
                usages: []
              };
            }
            const params = toolParams.data;

            const files = params.file_indexes.map((index) => ({
              index,
              url: filesMap[index]
            }));
            const result = await dispatchFileRead({
              files,
              teamId: runningUserInfo.teamId,
              tmbId: runningUserInfo.tmbId,
              customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse,
              model
            });

            if (result.nodeResponse) {
              childrenResponses.push(result.nodeResponse);
            }
            return {
              response: result.response,
              usages: result.usages
            };
          }
          if (toolId === SubAppIds.datasetSearch) {
            const toolParams = DatasetSearchToolSchema.safeParse(
              parseJsonArgs(call.function.arguments)
            );
            if (!toolParams.success) {
              return {
                response: toolParams.error.message,
                usages: []
              };
            }

            if (!datasetParams || datasetParams.datasets.length === 0) {
              return {
                response: 'No dataset selected',
                usages: []
              };
            }

            const params = toolParams.data;

            const result = await dispatchAgentDatasetSearch({
              query: params.query,
              config: {
                datasets: datasetParams.datasets,
                similarity: datasetParams.similarity || 0.4,
                maxTokens: datasetParams.limit || 5000,
                searchMode: datasetParams.searchMode,
                embeddingWeight: datasetParams.embeddingWeight,
                usingReRank: datasetParams.usingReRank ?? false,
                rerankModel: datasetParams.rerankModel,
                rerankWeight: datasetParams.rerankWeight || 0.5,
                usingExtensionQuery: datasetParams.datasetSearchUsingExtensionQuery ?? false,
                extensionModel: datasetParams.datasetSearchExtensionModel,
                extensionBg: datasetParams.datasetSearchExtensionBg
              },
              teamId: runningUserInfo.teamId,
              tmbId: runningUserInfo.tmbId,
              llmModel: model
            });

            if (result.nodeResponse) {
              childrenResponses.push(result.nodeResponse);
            }

            return {
              response: result.response,
              usages: result.usages
            };
          }
          if (toolId === SubAppIds.plan) {
            try {
              const toolArgs = await PlanAgentParamsSchema.safeParseAsync(
                parseJsonArgs(call.function.arguments)
              );

              if (!toolArgs.success) {
                return {
                  response: 'Tool arguments is not valid',
                  usages: []
                };
              }

              // plan: 1,3 场景
              planResult = await dispatchPlanAgent({
                checkIsStopping,
                completionTools,
                getSubAppInfo,
                systemPrompt,
                model,
                stream,
                mode: 'initial',
                task: toolArgs.data.task,
                description: toolArgs.data.description,
                background: toolArgs.data.background
              });

              return {
                response: '',
                stop: true
              };
            } catch (error) {
              console.log(error, 111);
              return {
                response: getErrText(error),
                stop: false
              };
            }
          }

          // User Sub App
          else {
            const tool = getSubApp(toolId);
            if (!tool) {
              return {
                response: `Can't find the tool ${toolId}`,
                usages: []
              };
            }
            const toolCallParams = parseJsonArgs(call.function.arguments);

            if (call.function.arguments && !toolCallParams) {
              return {
                response: 'params is not object',
                usages: []
              };
            }

            // Get params
            const requestParams = {
              ...tool.params,
              ...toolCallParams
            };
            // Remove sensitive data

            if (tool.type === 'tool') {
              const { response, usages, runningTime, toolParams, result } = await dispatchTool({
                tool: {
                  name: tool.name,
                  version: tool.version,
                  toolConfig: tool.toolConfig
                },
                params: requestParams,
                runningUserInfo,
                runningAppInfo,
                variables,
                workflowStreamResponse: stepStreamResponse
              });

              childrenResponses.push({
                nodeId: callId,
                id: callId,
                runningTime,
                moduleType: FlowNodeTypeEnum.tool,
                moduleName: tool.name,
                moduleLogo: tool.avatar,
                toolInput: toolParams,
                toolRes: result || response,
                totalPoints: usages?.reduce((sum, item) => sum + item.totalPoints, 0)
              });
              return {
                response,
                usages
              };
            } else if (tool.type === 'workflow') {
              const { userChatInput, ...params } = requestParams;

              const { response, runningTime, usages } = await dispatchApp({
                appId: tool.id,
                userChatInput: userChatInput,
                customAppVariables: params,
                checkIsStopping,
                lang: props.lang,
                requestOrigin: props.requestOrigin,
                mode: props.mode,
                timezone: props.timezone,
                externalProvider: props.externalProvider,
                runningAppInfo: props.runningAppInfo,
                runningUserInfo: props.runningUserInfo,
                retainDatasetCite: props.retainDatasetCite,
                maxRunTimes: props.maxRunTimes,
                workflowDispatchDeep: props.workflowDispatchDeep,
                variables: props.variables
              });

              childrenResponses.push({
                nodeId: callId,
                id: callId,
                runningTime,
                moduleType: FlowNodeTypeEnum.appModule,
                moduleName: tool.name,
                moduleLogo: tool.avatar,
                toolInput: requestParams,
                toolRes: response,
                totalPoints: usages?.reduce((sum, item) => sum + item.totalPoints, 0)
              });

              return {
                response,
                usages,
                runningTime
              };
            } else if (tool.type === 'toolWorkflow') {
              const { response, result, runningTime, usages } = await dispatchPlugin({
                appId: tool.id,
                userChatInput: '',
                customAppVariables: requestParams,
                checkIsStopping,
                lang: props.lang,
                requestOrigin: props.requestOrigin,
                mode: props.mode,
                timezone: props.timezone,
                externalProvider: props.externalProvider,
                runningAppInfo: props.runningAppInfo,
                runningUserInfo: props.runningUserInfo,
                retainDatasetCite: props.retainDatasetCite,
                maxRunTimes: props.maxRunTimes,
                workflowDispatchDeep: props.workflowDispatchDeep,
                variables: props.variables
              });

              childrenResponses.push({
                nodeId: callId,
                id: callId,
                runningTime,
                moduleType: FlowNodeTypeEnum.pluginModule,
                moduleName: tool.name,
                moduleLogo: tool.avatar,
                toolInput: requestParams,
                toolRes: result,
                totalPoints: usages?.reduce((sum, item) => sum + item.totalPoints, 0)
              });

              return {
                response,
                usages,
                runningTime
              };
            } else {
              return {
                response: 'Invalid tool type',
                usages: []
              };
            }
          }
        } catch (error) {
          return {
            response: getErrText(error),
            usages: []
          };
        }
      })();

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

      // TODO: 推送账单

      return {
        response,
        assistantMessages: [], // TODO
        usages,
        stop
      };
    },
    onToolCompress: ({ call, response, usage }) => {
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
    handleInteractiveTool: async ({ toolParams }) => {
      return {
        response: 'Interactive tool not supported',
        assistantMessages: [], // TODO
        usages: []
      };
    }
  });

  const llmUsage = formatModelChars2Points({
    model: agentModel,
    inputTokens,
    outputTokens
  });
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
      masterMessages: masterMessages.concat(assistantMessages)
    };
  }

  nodeResponse.runningTime = +((Date.now() - startTime) / 1000).toFixed(2);
  // Default
  return {
    planResponse: planResult,
    completeMessages,
    assistantMessages,
    nodeResponse,
    masterMessages: filterMemoryMessages(completeMessages)
  };
};
