import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps,
  RuntimeNodeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import { getLLMModel } from '../../../../ai/model';
import { getNodeErrResponse, getHistories, getWorkflowChildResponseWrite } from '../../utils';
import { runAgentCall } from '../../../../ai/llm/agentCall';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { type ChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  GPTMessages2Chats,
  chats2GPTMessages,
  getSystemPrompt_ChatItemType,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import {
  filterMemoryMessages,
  filterToolResponseToPreview,
  formatToolResponse,
  getToolNodesByIds,
  initToolNodes,
  parseToolArgs
} from '../utils';
import { SubAppIds, systemSubInfo } from './sub/constants';
import {
  getReferenceVariableValue,
  replaceEditorVariable,
  textAdaptGptResponse,
  valueTypeFormat
} from '@fastgpt/global/core/workflow/runtime/utils';
import { dispatchPlanAgent } from './sub/plan';
import { dispatchModelAgent } from './sub/model';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { getSubApps, rewriteSubAppsToolset } from './sub';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { dispatchTool } from './sub/tool';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getMasterAgentDefaultPrompt } from './constants';
import { addFilePrompt2Input, getFileInputPrompt } from './sub/file/utils';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { dispatchFileRead } from './sub/file';
import { dispatchApp, dispatchPlugin } from './sub/app';

export type DispatchAgentModuleProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.history]?: ChatItemType[];
  [NodeInputKeyEnum.userChatInput]: string;

  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]: string;
  [NodeInputKeyEnum.aiChatTemperature]?: number;
  [NodeInputKeyEnum.aiChatTopP]?: number;

  [NodeInputKeyEnum.subApps]?: FlowNodeTemplateType[];
  [NodeInputKeyEnum.planAgentConfig]?: Record<string, any>;
}>;

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

export const dispatchRunAgent = async (props: DispatchAgentModuleProps): Promise<Response> => {
  let {
    node: { nodeId, name, isEntry, version, inputs },
    lang,
    runtimeNodes,
    histories,
    query,
    requestOrigin,
    chatConfig,
    lastInteractive,
    runningUserInfo,
    runningAppInfo,
    variables,
    externalProvider,
    stream,
    res,
    workflowStreamResponse,
    params: {
      model,
      systemPrompt,
      userChatInput,
      history = 6,
      fileUrlList: fileLinks,
      temperature,
      aiChatTopP,
      subApps = [],
      planAgentConfig
    }
  } = props;
  const memoryKey = `${runningAppInfo.id}-${nodeId}`;

  const runtimeSubApps = await rewriteSubAppsToolset({
    subApps: subApps.map<RuntimeNodeItemType>((node) => {
      return {
        nodeId: node.id,
        name: node.name,
        avatar: node.avatar,
        intro: node.intro,
        toolDescription: node.toolDescription,
        flowNodeType: node.flowNodeType,
        showStatus: node.showStatus,
        isEntry: false,
        inputs: node.inputs,
        outputs: node.outputs,
        pluginId: node.pluginId,
        version: node.version,
        toolConfig: node.toolConfig,
        catchError: node.catchError
      };
    }),
    lang
  });

  try {
    const agentModel = getLLMModel(model);
    const chatHistories = getHistories(history, histories);

    // Get files
    const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
    if (!fileUrlInput || !fileUrlInput.value || fileUrlInput.value.length === 0) {
      fileLinks = undefined;
    }
    const { filesMap, prompt: fileInputPrompt } = getFileInputPrompt({
      fileUrls: fileLinks,
      requestOrigin,
      maxFiles: chatConfig?.fileSelectConfig?.maxFiles || 20,
      histories: chatHistories
    });

    const subAppList = getSubApps({
      subApps: runtimeSubApps,
      addReadFileTool: Object.keys(filesMap).length > 0
    });

    // Init tool params
    const toolNodesMap = new Map(runtimeSubApps.map((item) => [item.nodeId, item]));
    const getToolInfo = (id: string) => {
      const toolNode = toolNodesMap.get(id) || systemSubInfo[id];
      return {
        name: toolNode?.name || '',
        avatar: toolNode?.avatar || ''
      };
    };

    const systemMessages = chats2GPTMessages({
      messages: getSystemPrompt_ChatItemType(systemPrompt || getMasterAgentDefaultPrompt()),
      reserveId: false
    });
    const historyMessages: ChatCompletionMessageParam[] = (() => {
      const lastHistory = chatHistories[chatHistories.length - 1];
      if (lastHistory && lastHistory.obj === ChatRoleEnum.AI && lastHistory.memories?.[memoryKey]) {
        return lastHistory.memories?.[memoryKey];
      }

      return chats2GPTMessages({ messages: chatHistories, reserveId: false });
    })();
    const userMessages = chats2GPTMessages({
      messages: [
        {
          obj: ChatRoleEnum.Human,
          value: runtimePrompt2ChatsValue({
            text: addFilePrompt2Input({ query: userChatInput, filePrompt: fileInputPrompt }),
            files: []
          })
        }
      ],
      reserveId: false
    });
    const requestMessages = [...systemMessages, ...historyMessages, ...userMessages];

    // Check interactive entry
    props.node.isEntry = false;

    const dispatchFlowResponse: ChatHistoryItemResType[] = [];
    // console.log(JSON.stringify(requestMessages, null, 2));
    const { completeMessages, assistantResponses, inputTokens, outputTokens, subAppUsages } =
      await runAgentCall({
        maxRunAgentTimes: 100,
        interactiveEntryToolParams: lastInteractive?.toolParams,
        body: {
          messages: requestMessages,
          model: agentModel,
          temperature,
          stream,
          top_p: aiChatTopP,
          subApps: subAppList
        },

        userKey: externalProvider.openaiAccount,
        isAborted: res ? () => res.closed : undefined,
        getToolInfo,

        onReasoning({ text }) {
          workflowStreamResponse?.({
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({
              reasoning_content: text
            })
          });
        },
        onStreaming({ text }) {
          workflowStreamResponse?.({
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({
              text
            })
          });
        },
        onToolCall({ call }) {
          const toolNode = getToolInfo(call.function.name);
          workflowStreamResponse?.({
            id: call.id,
            event: SseResponseEventEnum.toolCall,
            data: {
              tool: {
                id: call.id,
                toolName: toolNode?.name || call.function.name,
                toolAvatar: toolNode?.avatar || '',
                functionName: call.function.name,
                params: call.function.arguments ?? '',
                response: ''
              }
            }
          });
        },
        onToolParam({ call, params }) {
          workflowStreamResponse?.({
            id: call.id,
            event: SseResponseEventEnum.toolParams,
            data: {
              tool: {
                id: call.id,
                toolName: '',
                toolAvatar: '',
                params,
                response: ''
              }
            }
          });
        },

        handleToolResponse: async ({ call, messages }) => {
          const toolId = call.function.name;
          const childWorkflowStreamResponse = getWorkflowChildResponseWrite({
            id: call.id,
            fn: workflowStreamResponse
          });

          const {
            response,
            usages = [],
            isEnd,
            streamResponse = true
          } = await (async () => {
            try {
              if (toolId === SubAppIds.stop) {
                return {
                  response: '',
                  usages: [],
                  isEnd: true
                };
              } else if (toolId === SubAppIds.plan) {
                const { response, usages } = await dispatchPlanAgent({
                  messages,
                  tools: subAppList,
                  model,
                  temperature,
                  top_p: aiChatTopP,
                  stream,
                  onStreaming({ text }) {
                    childWorkflowStreamResponse?.({
                      event: SseResponseEventEnum.toolResponse,
                      data: {
                        tool: {
                          id: call.id,
                          toolName: '',
                          toolAvatar: '',
                          params: '',
                          response: text
                        }
                      }
                    });
                  }
                });

                return {
                  response,
                  usages,
                  isEnd: false,
                  streamResponse: false
                };
              } else if (toolId === SubAppIds.model) {
                const { systemPrompt, task } = parseToolArgs<{
                  systemPrompt: string;
                  task: string;
                }>(call.function.arguments);

                const { response, usages } = await dispatchModelAgent({
                  model,
                  temperature,
                  top_p: aiChatTopP,
                  stream,
                  systemPrompt,
                  task,
                  onStreaming({ text }) {
                    childWorkflowStreamResponse?.({
                      event: SseResponseEventEnum.toolResponse,
                      data: {
                        tool: {
                          id: call.id,
                          toolName: '',
                          toolAvatar: '',
                          params: '',
                          response: text
                        }
                      }
                    });
                  }
                });
                return {
                  response,
                  usages,
                  isEnd: false,
                  streamResponse: false
                };
              } else if (toolId === SubAppIds.fileRead) {
                const { file_indexes } = parseToolArgs<{
                  file_indexes: string[];
                }>(call.function.arguments);
                if (!Array.isArray(file_indexes)) {
                  return {
                    response: 'file_indexes is not array',
                    usages: [],
                    isEnd: false
                  };
                }

                const files = file_indexes.map((index) => ({
                  index,
                  url: filesMap[index]
                }));
                const result = await dispatchFileRead({
                  files,
                  teamId: runningUserInfo.teamId,
                  tmbId: runningUserInfo.tmbId,
                  customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse
                });
                return {
                  response: result.response,
                  usages: result.usages,
                  isEnd: false
                };
              }
              // User Sub App
              else {
                const node = toolNodesMap.get(toolId);
                if (!node) {
                  return {
                    response: 'Can not find the tool',
                    usages: [],
                    isEnd: false
                  };
                }

                const toolCallParams = parseToolArgs(call.function.arguments);
                // Get params
                const requestParams = (() => {
                  const params: Record<string, any> = toolCallParams;

                  node.inputs.forEach((input) => {
                    if (input.key in toolCallParams) {
                      return;
                    }
                    // Skip some special key
                    if (
                      [
                        NodeInputKeyEnum.childrenNodeIdList,
                        NodeInputKeyEnum.systemInputConfig
                      ].includes(input.key as NodeInputKeyEnum)
                    ) {
                      params[input.key] = input.value;
                      return;
                    }

                    // replace {{$xx.xx$}} and {{xx}} variables
                    let value = replaceEditorVariable({
                      text: input.value,
                      nodes: runtimeNodes,
                      variables
                    });

                    // replace reference variables
                    value = getReferenceVariableValue({
                      value,
                      nodes: runtimeNodes,
                      variables
                    });

                    params[input.key] = valueTypeFormat(value, input.valueType);
                  });

                  return params;
                })();

                if (node.flowNodeType === FlowNodeTypeEnum.tool) {
                  const { response, usages } = await dispatchTool({
                    node,
                    params: requestParams,
                    runningUserInfo,
                    runningAppInfo,
                    variables,
                    workflowStreamResponse: childWorkflowStreamResponse
                  });
                  return {
                    response,
                    usages,
                    isEnd: false
                  };
                } else if (
                  node.flowNodeType === FlowNodeTypeEnum.appModule ||
                  node.flowNodeType === FlowNodeTypeEnum.pluginModule
                ) {
                  const fn =
                    node.flowNodeType === FlowNodeTypeEnum.appModule ? dispatchApp : dispatchPlugin;
                  const { response, usages } = await fn({
                    ...props,
                    node,
                    // stream: false,
                    workflowStreamResponse: undefined,
                    callParams: {
                      appId: node.pluginId,
                      version: node.version,
                      ...requestParams
                    }
                  });

                  return {
                    response,
                    usages,
                    isEnd: false
                  };
                } else {
                  return {
                    response: 'Can not find the tool',
                    usages: [],
                    isEnd: false
                  };
                }
              }
            } catch (error) {
              return {
                response: getErrText(error),
                usages: [],
                isEnd: false
              };
            }
          })();

          // Push stream response
          if (streamResponse) {
            childWorkflowStreamResponse?.({
              event: SseResponseEventEnum.toolResponse,
              data: {
                tool: {
                  id: call.id,
                  toolName: '',
                  toolAvatar: '',
                  params: '',
                  response
                }
              }
            });
          }

          // TODO: 推送账单

          return {
            response,
            usages,
            isEnd
          };
        }
      });

    // Usage count
    const { totalPoints: modelTotalPoints, modelName } = formatModelChars2Points({
      model,
      inputTokens,
      outputTokens
    });
    const modelUsage = externalProvider.openaiAccount?.key ? 0 : modelTotalPoints;
    const toolTotalPoints = subAppUsages.reduce((sum, item) => sum + item.totalPoints, 0);
    // concat tool usage
    const totalPointsUsage = modelUsage + toolTotalPoints;

    const previewAssistantResponses = filterToolResponseToPreview(assistantResponses);

    return {
      data: {
        [NodeOutputKeyEnum.answerText]: previewAssistantResponses
          .filter((item) => item.text?.content)
          .map((item) => item.text?.content || '')
          .join('')
      },
      // TODO: 需要对 memoryMessages 单独建表存储
      [DispatchNodeResponseKeyEnum.memories]: {
        [memoryKey]: filterMemoryMessages(completeMessages)
      },
      [DispatchNodeResponseKeyEnum.assistantResponses]: previewAssistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        // 展示的积分消耗
        totalPoints: totalPointsUsage,
        toolCallInputTokens: inputTokens,
        toolCallOutputTokens: outputTokens,
        childTotalPoints: toolTotalPoints,
        model: modelName,
        query: userChatInput,
        historyPreview: getHistoryPreview(
          GPTMessages2Chats({ messages: completeMessages, reserveTool: false }),
          10000,
          true
        ),
        toolDetail: dispatchFlowResponse,
        mergeSignId: nodeId
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
        // Model usage
        {
          moduleName: name,
          model: modelName,
          totalPoints: modelUsage,
          inputTokens: inputTokens,
          outputTokens: outputTokens
        },
        // Tool usage
        ...subAppUsages
      ],
      [DispatchNodeResponseKeyEnum.interactive]: undefined
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};
