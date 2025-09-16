import type { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
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
  chatValue2RuntimePrompt,
  chats2GPTMessages,
  getSystemPrompt_ChatItemType,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { filterMemoryMessages, filterToolResponseToPreview, parseToolArgs } from '../utils';
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
import { getSubAppsPrompt } from './sub/plan/prompt';

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
    workflowDispatchDeep,
    workflowStreamResponse,
    params: {
      model,
      systemPrompt,
      userChatInput: taskInput,
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

  // 交互模式进来的话，这个值才是交互输入的值
  const interactiveInput = lastInteractive ? chatValue2RuntimePrompt(query).text : '';

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
        avatar: toolNode?.avatar || '',
        toolDescription: toolNode?.toolDescription || toolNode?.name || ''
      };
    };

    /* ===== Plan Agent ===== */
    let planMessages: ChatCompletionMessageParam[] = [];
    /* 
      Top agent
      1. 首轮执行：有
      2. 交互/check：有
      3. Confirmed plan: 无
      4. masteragent 的交互时间: 无

      Sub agent
      只会执行一次，肯定有。
    */
    let masterPlanToolCallMessages: ChatCompletionMessageParam[] = [];

    if (
      // 不为 userSelect 和 userInput，或者如果为 agentPlanCheck 并且 interactiveInput !== ConfirmPlanAgentText 都会执行
      (lastInteractive?.type !== 'userSelect' &&
        lastInteractive?.type !== 'userInput' &&
        lastInteractive?.type !== 'agentPlanCheck') ||
      (lastInteractive?.type === 'agentPlanCheck' && interactiveInput !== ConfirmPlanAgentText)
    ) {
      // 临时代码
      const tmpText = '正在进行规划生成...\n';
      workflowStreamResponse?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: tmpText
        })
      });

      const {
        answerText,
        planList,
        planToolCallMessages,
        completeMessages,
        usages,
        interactiveResponse
      } = await dispatchPlanAgent({
        historyMessages: planHistoryMessages,
        userInput: lastInteractive ? interactiveInput : taskInput,
        interactive: lastInteractive,
        subAppPrompt: getSubAppsPrompt({ subAppList, getSubAppInfo }),
        model,
        systemPrompt,
        temperature,
        top_p: aiChatTopP,
        stream,
        isTopPlanAgent: workflowDispatchDeep === 1
      });

      const text = `${answerText}${planList ? `\n\`\`\`json\n${JSON.stringify(planList, null, 2)}\n\`\`\`` : ''}`;
      workflowStreamResponse?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text
        })
      });

      planMessages = completeMessages;
      masterPlanToolCallMessages = planToolCallMessages;

      // TODO: usage 合并
      // Sub agent plan 不会有交互响应。Top agent plan 肯定会有。
      if (interactiveResponse) {
        return {
          [DispatchNodeResponseKeyEnum.answerText]: `${tmpText}${text}`,
          [DispatchNodeResponseKeyEnum.memories]: {
            [planMessagesKey]: filterMemoryMessages(planMessages)
          },
          [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse
        };
      }
    }

    /* ===== Master agent ===== */

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

    const userMessages = chats2GPTMessages({
      messages: [
        {
          obj: ChatRoleEnum.Human,
          value: runtimePrompt2ChatsValue({
            text: addFilePrompt2Input({ query: taskInput, filePrompt: fileInputPrompt }),
            files: []
          })
        }
      ],
      reserveId: false
    });
    const requestMessages = [
      ...systemMessages,
      ...historyMessages,
      ...masterPlanToolCallMessages,
      ...userMessages
    ];

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
        messages: requestMessages,
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
          isEnd
        } = await (async () => {
          try {
            if (toolId === SubAppIds.stop) {
              return {
                response: '',
                usages: [],
                isEnd: true
              };
            }
            // TODO: 可能会再次触发 plan
            // else if (toolId === SubAppIds.plan) {
            // const { completeMessages, response, usages, interactiveResponse } =
            //   await dispatchPlanAgent({
            //     messages,
            //     subApps: subAppList,
            //     model,
            //     temperature,
            //     top_p: aiChatTopP,
            //     stream,
            //     onReasoning,
            //     onStreaming
            //   });

            // return {
            //   response,
            //   usages,
            //   isEnd: false,
            //   interactive: interactiveResponse
            // };
            // }
            else if (toolId === SubAppIds.model) {
              const params = parseToolArgs<{
                systemPrompt: string;
                task: string;
              }>(call.function.arguments);

              if (!params) {
                return {
                  response: 'params is not object',
                  usages: [],
                  isEnd: false
                };
              }

              const { response, usages } = await dispatchModelAgent({
                model,
                temperature,
                top_p: aiChatTopP,
                stream,
                systemPrompt: params.systemPrompt,
                task: params.task,
                onReasoning,
                onStreaming
              });
              return {
                response,
                usages,
                isEnd: false
              };
            } else if (toolId === SubAppIds.fileRead) {
              const params = parseToolArgs<{
                file_indexes: string[];
              }>(call.function.arguments);
              if (!params) {
                return {
                  response: 'params is not object',
                  usages: [],
                  isEnd: false
                };
              }
              if (!Array.isArray(params.file_indexes)) {
                return {
                  response: 'file_indexes is not array',
                  usages: [],
                  isEnd: false
                };
              }

              const files = params.file_indexes.map((index) => ({
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

              if (!toolCallParams) {
                return {
                  response: 'params is not object',
                  usages: [],
                  isEnd: false
                };
              }

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
      // 目前 Master 不会触发交互
      // [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse,
      // TODO: 需要对 memoryMessages 单独建表存储
      [DispatchNodeResponseKeyEnum.memories]: {
        [masterMessagesKey]: filterMemoryMessages(completeMessages),
        [planMessagesKey]: [filterMemoryMessages(planMessages)]
      },
      [DispatchNodeResponseKeyEnum.assistantResponses]: previewAssistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        // 展示的积分消耗
        totalPoints: totalPointsUsage,
        toolCallInputTokens: inputTokens,
        toolCallOutputTokens: outputTokens,
        childTotalPoints: toolTotalPoints,
        model: modelName,
        query: taskInput,
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
      ]
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};
