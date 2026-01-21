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
import { DatasetSearchToolSchema, type DatasetSearchToolConfig } from '../sub/dataset/utils';
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

type Response = {
  stepResponse?: {
    rawResponse: string;
    summary: string;
  };
  planResponse?: DispatchPlanAgentResponse;
  completeMessages: ChatCompletionMessageParam[];
  assistantMessages: ChatCompletionMessageParam[];

  nodeResponse: ChatHistoryItemResType;
};

export const masterCall = async ({
  systemPrompt,
  defaultMessages,
  getSubAppInfo,
  completionTools,
  filesMap,
  subAppsMap,
  initialRequest,
  steps,
  step,
  ...props
}: DispatchAgentModuleProps & {
  systemPrompt?: string;
  defaultMessages: ChatCompletionMessageParam[];
  getSubAppInfo: GetSubAppInfoFnType;
  completionTools: ChatCompletionTool[];
  filesMap: Record<string, string>;
  subAppsMap: Map<string, SubAppRuntimeType>;

  initialRequest?: boolean;
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
    params: { model }
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
      ...defaultMessages
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
    childrenUsages
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
          if (toolId === SubAppIds.plan) {
            try {
              const toolArgs = parseJsonArgs<{ description: string }>(call.function.arguments);
              const query = toolArgs?.description;

              planResult = await dispatchPlanAgent({
                checkIsStopping,
                defaultMessages,
                userInput: initialRequest ? undefined : query,
                completionTools,
                getSubAppInfo,
                systemPrompt,
                model,
                stream,
                mode: initialRequest ? 'initial' : 'continue' //  目前不支持深层 plan 调用的话，step Call 的情况下不会调用到 plan agent
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
            const params = toolParams.data;

            // 从 subAppsMap 获取工具配置
            const tool = subAppsMap.get(toolId);
            if (!tool) {
              return {
                response: '知识库检索工具未配置',
                usages: []
              };
            }

            const config = tool.params as DatasetSearchToolConfig;
            if (!config.datasets || config.datasets.length === 0) {
              return {
                response: '未选择知识库',
                usages: []
              };
            }

            const result = await dispatchAgentDatasetSearch({
              query: params.query,
              config,
              teamId: runningUserInfo.teamId,
              tmbId: runningUserInfo.tmbId,
              model: config.model,
              histories: messages
            });

            return {
              response: result.response,
              usages: result.usages
            };
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
                toolRes: result,
                totalPoints: usages?.reduce((sum, item) => sum + item.totalPoints, 0)
              });

              return {
                response,
                usages
              };
            } else if (tool.type === 'workflow' || tool.type === 'toolWorkflow') {
              // const fn = tool.type === 'workflow' ? dispatchApp : dispatchPlugin;

              // const { response, usages } = await fn({
              //   ...props,
              //   node,
              //   workflowStreamResponse:stepStreamResponse,
              //   callParams: {
              //     appId: node.pluginId,
              //     version: node.version,
              //     ...requestParams
              //   }
              // });

              // return {
              //   response,
              //   usages
              // };
              return {
                response: 'Can not find the tool',
                usages: []
              };
            } else {
              return {
                response: 'Can not find the tool',
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
    inputTokens,
    outputTokens,
    totalPoints: childTotalPoints + llmUsage.totalPoints,
    childrenResponses
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
      nodeResponse
    };
  }

  nodeResponse.runningTime = +((Date.now() - startTime) / 1000).toFixed(2);
  // Default
  return {
    planResponse: planResult,
    completeMessages,
    assistantMessages,
    nodeResponse
  };
};
