import type { ChatCompletionMessageParam, ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { runAgentCall } from '../../../../../ai/llm/agentCall';
import { chats2GPTMessages, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { addFilePrompt2Input, ReadFileToolSchema } from '../sub/file/utils';
import { type AgentStepItemType } from '@fastgpt/global/core/ai/agent/type';
import type { GetSubAppInfoFnType, SubAppRuntimeType } from '../type';
import { getStepCallQuery } from '../constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { SubAppIds } from '../sub/constants';
import { parseJsonArgs } from '../../../../../ai/utils';
import { dispatchFileRead } from '../sub/file';
import { dispatchTool } from '../sub/tool';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { DatasetSearchToolSchema } from '../sub/dataset/utils';
import { dispatchAgentDatasetSearch } from '../sub/dataset';
import type { DispatchAgentModuleProps } from '..';
import { getLLMModel } from '../../../../../ai/model';
import { getStepDependon } from './dependon';
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
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { PlanAgentParamsSchema } from '../sub/plan/constants';
import { filterMemoryMessages } from '../../utils';

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
  completionTools,
  filesMap,
  subAppsMap,
  steps,
  step,
  ...props
}: DispatchAgentModuleProps & {
  masterMessages: ChatCompletionMessageParam[];
  planMessages: ChatCompletionMessageParam[];
  systemPrompt?: string;

  getSubAppInfo: GetSubAppInfoFnType;
  completionTools: ChatCompletionTool[];
  filesMap: Record<string, string>;
  subAppsMap: Map<string, SubAppRuntimeType>;

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
      userChatInput,
      // Dataset search configuration
      datasets: datasetSelectList,
      similarity: datasetSimilarity = 0.4,
      limit: datasetMaxTokens = 5000,
      searchMode: datasetSearchMode = DatasetSearchModeEnum.embedding,
      embeddingWeight: datasetSearchEmbeddingWeight,
      usingReRank: datasetSearchUsingReRank = false,
      rerankModel: datasetSearchRerankModel,
      rerankWeight: datasetSearchRerankWeight,
      datasetSearchUsingExtensionQuery: datasetSearchUsingExtensionQuery = false,
      datasetSearchExtensionModel: datasetSearchExtensionModel,
      datasetSearchExtensionBg: datasetSearchExtensionBg
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
        if (nodeResponse) {
          childrenResponses.push(nodeResponse);
        }
        step.depends_on = depends;
      }
      // Step call system prompt
      const callQuery = await getStepCallQuery({
        steps,
        step,
        model,
        filesMap
      });
      if (callQuery.usage) {
        usagePush([callQuery.usage]);
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

    // Get history messages
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system' as const,
        content: getMasterSystemPrompt(systemPrompt)
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
    finish_reason
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
    onCompressContext({ modelName, inputTokens, outputTokens, totalPoints, seconds }) {
      childrenResponses.push({
        nodeId: getNanoid(),
        id: getNanoid(),
        moduleType: FlowNodeTypeEnum.emptyNode,
        moduleName: i18nT('chat:compress_llm_messages'),
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

            if (!datasetSelectList || datasetSelectList.length === 0) {
              return {
                response: 'No dataset selected',
                usages: []
              };
            }

            const params = toolParams.data;

            const result = await dispatchAgentDatasetSearch({
              query: params.query,
              config: {
                datasets: datasetSelectList,
                similarity: datasetSimilarity,
                maxTokens: datasetMaxTokens,
                searchMode: datasetSearchMode,
                embeddingWeight: datasetSearchEmbeddingWeight,
                usingReRank: datasetSearchUsingReRank,
                rerankModel: datasetSearchRerankModel,
                rerankWeight: datasetSearchRerankWeight,
                usingExtensionQuery: datasetSearchUsingExtensionQuery,
                extensionModel: datasetSearchExtensionModel,
                extensionBg: datasetSearchExtensionBg,
                model
              },
              teamId: runningUserInfo.teamId,
              tmbId: runningUserInfo.tmbId,
              histories: messages
            });

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
            const tool = subAppsMap.get(toolId);
            if (!tool) {
              return {
                response: `Can not find the tool ${toolId}`,
                usages: []
              };
            }

            const toolCallParams = parseJsonArgs(call.function.arguments);

            if (!toolCallParams) {
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

            if (tool.type === 'tool') {
              const { response, usages, runningTime, result } = await dispatchTool({
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
                nodeId: getNanoid(),
                id: getNanoid(),
                runningTime,
                moduleType: FlowNodeTypeEnum.tool,
                moduleName: tool.name,
                moduleLogo: tool.avatar,
                toolInput: requestParams,
                toolRes: result || response,
                totalPoints: usages?.reduce((sum, item) => sum + item.totalPoints, 0)
              });
              return {
                response,
                usages
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
    nodeId: getNanoid(),
    id: getNanoid(),
    moduleType: FlowNodeTypeEnum.agent,
    moduleName: i18nT('chat:agent_call'),
    model: llmUsage.modelName,
    moduleLogo: 'core/app/type/agentFill',
    inputTokens,
    outputTokens,
    totalPoints: childTotalPoints + llmUsage.totalPoints,
    childrenResponses,
    finishReason: finish_reason
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
      response: answerText,
      model
    });
    usagePush([summaryUsage]);
    nodeResponse.childrenResponses?.push(summaryNodeResponse);
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
