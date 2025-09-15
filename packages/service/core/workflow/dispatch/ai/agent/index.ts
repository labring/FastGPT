import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  ConfirmPlanAgentText,
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
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { dispatchTool } from './sub/tool';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getMasterAgentDefaultPrompt } from './constants';
import { addFilePrompt2Input, getFileInputPrompt } from './sub/file/utils';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { dispatchFileRead } from './sub/file';
import { dispatchApp, dispatchPlugin } from './sub/app';
import type { InteractiveNodeResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';

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
  const agentModel = getLLMModel(model);
  const chatHistories = getHistories(history, histories);

  const masterMessagesKey = `masterMessages-${nodeId}`;
  const planMessagesKey = `planMessages-${nodeId}`;

  // Get history messages
  const { masterHistoryMessages, planHistoryMessages } = (() => {
    const lastHistory = chatHistories[chatHistories.length - 1];
    if (lastHistory && lastHistory.obj === ChatRoleEnum.AI) {
      return {
        masterHistoryMessages: (lastHistory.memories?.[masterMessagesKey] ||
          []) as ChatCompletionMessageParam[],
        planHistoryMessages: (lastHistory.memories?.[planMessagesKey] ||
          []) as ChatCompletionMessageParam[]
      };
    }
    return {
      masterHistoryMessages: [],
      planHistoryMessages: []
    };
  })();

  // Check interactive entry
  props.node.isEntry = false;

  try {
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

    // Get sub apps
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

    const subAppList = getSubApps({
      subApps: runtimeSubApps,
      addReadFileTool: Object.keys(filesMap).length > 0
    });

    const subAppsMap = new Map(runtimeSubApps.map((item) => [item.nodeId, item]));
    const getSubAppInfo = (id: string) => {
      const toolNode = subAppsMap.get(id) || systemSubInfo[id];
      return {
        name: toolNode?.name || '',
        avatar: toolNode?.avatar || ''
      };
    };

    // Get master request messages
    const systemMessages = chats2GPTMessages({
      messages: getSystemPrompt_ChatItemType(getMasterAgentDefaultPrompt()),
      reserveId: false
    });
    const historyMessages: ChatCompletionMessageParam[] = (() => {
      if (masterHistoryMessages && masterHistoryMessages.length > 0) {
        return masterHistoryMessages;
      }

      return chats2GPTMessages({ messages: chatHistories, reserveId: false });
    })();

    if (lastInteractive?.type !== 'userSelect' && lastInteractive?.type !== 'userInput') {
      userChatInput = query[0].text?.content ?? userChatInput;
    }
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

    const masterRequestMessages = [...systemMessages, ...historyMessages, ...userMessages];
    const planRequestMessages = [...systemMessages, ...historyMessages, ...userMessages];

    // TODO: 执行 plan function(只有lastInteractive userselect/userInput 时候，才不需要进入 plan)
    if (
      lastInteractive?.type !== 'userSelect' &&
      lastInteractive?.type !== 'userInput' &&
      userChatInput !== ConfirmPlanAgentText
    ) {
      const { response, usages, assistantResponses, interactiveResponse } = await dispatchPlanAgent(
        {
          messages: planRequestMessages,
          subApps: subAppList,
          model,
          temperature,
          top_p: aiChatTopP,
          stream,
          getToolInfo: getSubAppInfo,
          onReasoning: ({ text }: { text: string }) => {
            workflowStreamResponse?.({
              event: SseResponseEventEnum.answer,
              data: textAdaptGptResponse({
                reasoning_content: text
              })
            });
          },
          onStreaming: ({ text }: { text: string }) => {
            workflowStreamResponse?.({
              event: SseResponseEventEnum.answer,
              data: textAdaptGptResponse({
                text
              })
            });
          }
        }
      );

      response ?? planRequestMessages.push({ role: 'assistant', content: response });

      const checkResponse: InteractiveNodeResponseType = {
        type: 'agentPlanCheck',
        params: {}
      };

      if (response) {
        const toolId = getNanoid(6);
        masterRequestMessages.push({
          role: 'assistant',
          tool_calls: [
            {
              id: toolId,
              type: 'function',
              function: {
                name: SubAppIds.plan,
                arguments: ''
              }
            }
          ]
        });
        masterRequestMessages.push({
          role: 'tool',
          tool_call_id: toolId,
          content: response
        });
      }

      return {
        [DispatchNodeResponseKeyEnum.memories]: {
          [masterMessagesKey]: filterMemoryMessages(masterRequestMessages),
          [planMessagesKey]: filterMemoryMessages(planRequestMessages)
        },
        [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse ?? checkResponse

        // Mock：返回 plan check
        // [DispatchNodeResponseKeyEnum.interactive]: {
        //   type: 'agentPlanCheck',
        //   params: {}
        // }

        // Mock: 返回 plan user select
        // [DispatchNodeResponseKeyEnum.interactive]: {
        //   type: 'agentPlanAskUserSelect',
        //   params: {
        //     description: '测试',
        //     userSelectOptions: [
        //       {
        //         key: 'test',
        //         value: '测试'
        //       },
        //       {
        //         key: 'test2',
        //         value: '测试2'
        //       }
        //     ]
        //   }
        // }
        // Mock: 返回 plan user input
        // [DispatchNodeResponseKeyEnum.interactive]: {
        //   type: 'agentPlanAskUserForm',
        //   params: {
        //     description: '测试',
        //     inputForm: [
        //       {
        //         type: FlowNodeInputTypeEnum.input,
        //         key: 'test1',
        //         label: '测试1',
        //         value: '',
        //         valueType: WorkflowIOValueTypeEnum.string,
        //         required: true
        //       }
        //     ]
        //   }
        // }
        // Mock: 返回 plan user query
        // [DispatchNodeResponseKeyEnum.interactive]: {
        //   type: 'agentPlanAskQuery',
        //   params: {
        //     content: '请提供 xxxxx'
        //   }
        // }
      };
    }

    const dispatchFlowResponse: ChatHistoryItemResType[] = [];
    const {
      completeMessages,
      assistantResponses,
      inputTokens,
      outputTokens,
      subAppUsages,
      interactiveResponse
    } = await runAgentCall({
      maxRunAgentTimes: 100,
      interactiveEntryToolParams: lastInteractive?.toolParams,
      body: {
        messages: masterRequestMessages,
        model: agentModel,
        temperature,
        stream,
        top_p: aiChatTopP,
        subApps: subAppList
      },

      userKey: externalProvider.openaiAccount,
      isAborted: res ? () => res.closed : undefined,
      getToolInfo: getSubAppInfo,

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
        const subApp = getSubAppInfo(call.function.name);
        workflowStreamResponse?.({
          id: call.id,
          event: SseResponseEventEnum.toolCall,
          data: {
            tool: {
              id: `${nodeId}/${call.function.name}`,
              toolName: subApp?.name || call.function.name,
              toolAvatar: subApp?.avatar || '',
              functionName: call.function.name,
              params: call.function.arguments ?? ''
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
              params
            }
          }
        });
      },

      handleToolResponse: async ({ call, messages }) => {
        const toolId = call.function.name;
        const childWorkflowStreamResponse = getWorkflowChildResponseWrite({
          subAppId: `${nodeId}/${toolId}`,
          id: call.id,
          fn: workflowStreamResponse
        });
        const onReasoning = ({ text }: { text: string }) => {
          childWorkflowStreamResponse?.({
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({
              reasoning_content: text
            })
          });
        };
        const onStreaming = ({ text }: { text: string }) => {
          childWorkflowStreamResponse?.({
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({
              text
            })
          });
        };

        const {
          response,
          usages = [],
          isEnd,
          interactive
        } = await (async () => {
          try {
            if (toolId === SubAppIds.stop) {
              return {
                response: '',
                usages: [],
                isEnd: true
              };
            } else if (toolId === SubAppIds.plan) {
              const { response, usages, interactiveResponse } = await dispatchPlanAgent({
                messages,
                subApps: subAppList,
                model,
                temperature,
                top_p: aiChatTopP,
                stream,
                getToolInfo: getSubAppInfo,
                onReasoning,
                onStreaming
              });

              const planCheckInteractive: InteractiveNodeResponseType = {
                type: 'agentPlanCheck',
                params: {}
              };

              return {
                response,
                usages,
                isEnd: false,
                interactive: interactiveResponse ?? planCheckInteractive
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
                onReasoning,
                onStreaming
              });
              return {
                response,
                usages,
                isEnd: false
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
              const node = subAppsMap.get(toolId);
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
                  workflowStreamResponse: childWorkflowStreamResponse,
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
        workflowStreamResponse?.({
          id: call.id,
          event: SseResponseEventEnum.toolResponse,
          data: {
            tool: {
              id: call.id,
              response
            }
          }
        });

        // TODO: 推送账单

        return {
          response,
          usages,
          isEnd,
          interactive
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
        [masterMessagesKey]: filterMemoryMessages(completeMessages),
        [planMessagesKey]: [filterMemoryMessages(completeMessages)] // TODO: plan messages 需要记录
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
      [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};
