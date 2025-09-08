import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  toolValueTypeList,
  valueTypeJsonSchemaMap
} from '@fastgpt/global/core/workflow/constants';
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
import { filterToolNodeIdByEdges, getNodeErrResponse, getHistories } from '../../utils';
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
  applyDiff,
  filterToolResponseToPreview,
  formatToolResponse,
  getToolNodesByIds,
  initToolNodes,
  parseToolArgs
} from '../utils';
import {
  getFileReadTool,
  getTopAgentConstantPrompt,
  StopAgentTool,
  SubAppIds
} from './sub/constants';
import { runWorkflow } from '../..';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import type { ToolNodeItemType } from './type';
import {
  getReferenceVariableValue,
  replaceEditorVariable,
  textAdaptGptResponse,
  valueTypeFormat
} from '@fastgpt/global/core/workflow/runtime/utils';
import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { transferPlanAgent } from './sub/plan';
import { transferModelAgent } from './sub/model';
import { PlanAgentTool } from './sub/plan/constants';
import { ModelAgentTool } from './sub/model/constants';
import { getSubIdsByAgentSystem, parseAgentSystem } from './utils';
import { getChildAppPreviewNode } from '../../../../../core/app/plugin/controller';
import type {
  FlowNodeTemplateType,
  NodeToolConfigType
} from '@fastgpt/global/core/workflow/type/node';
import type { SystemToolInputTypeEnum } from '@fastgpt/global/core/app/systemTool/constants';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import type { appConfigType } from './sub/app';
import type { DatasetConfigType } from './sub/dataset';
import { getSubApps } from './sub';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { dispatchRunTool } from '../../child/runTool';
import { dispatchRunAppNode } from '../../child/runApp';
import { dispatchRunPlugin } from '../../plugin/run';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { dispatchTool } from './sub/tool';

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
    runtimeNodes,
    runtimeEdges,
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

  const runtimeSubApps = subApps.map<RuntimeNodeItemType>((node) => {
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
  });

  try {
    const agentModel = getLLMModel(model);
    const chatHistories = getHistories(history, histories);

    const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
    if (!fileUrlInput || !fileUrlInput.value || fileUrlInput.value.length === 0) {
      fileLinks = undefined;
    }

    // Init tool params
    const toolNodesMap = new Map(runtimeSubApps.map((item) => [item.nodeId, item]));
    const getToolInfo = (id: string) => {
      const toolNode = toolNodesMap.get(id);
      return {
        name: toolNode?.name || '',
        avatar: toolNode?.avatar || ''
      };
    };

    const subAppList = await getSubApps({ subApps: runtimeSubApps, urls: fileLinks });
    console.log(JSON.stringify(subAppList, null, 2));
    // const combinedSystemPrompt = `${parseAgentSystem({ systemPrompt, toolNodesMap })}\n\n${getTopAgentConstantPrompt()}`;

    // TODO: 把 files 加入 query 中。
    const messages: ChatItemType[] = (() => {
      const value: ChatItemType[] = [
        // ...getSystemPrompt_ChatItemType(combinedSystemPrompt),
        // Add file input prompt to histories
        ...chatHistories,
        {
          obj: ChatRoleEnum.Human,
          value: runtimePrompt2ChatsValue({
            text: userChatInput,
            files: []
          })
        }
      ];
      if (lastInteractive && isEntry) {
        return value.slice(0, -2);
      }
      return value;
    })();

    // Check interactive entry
    props.node.isEntry = false;

    const adaptMessages = chats2GPTMessages({
      messages,
      reserveId: false
    });

    const dispatchFlowResponse: ChatHistoryItemResType[] = [];

    const { completeMessages, assistantResponses, inputTokens, outputTokens, subAppUsages } =
      await runAgentCall({
        maxRunAgentTimes: 100,
        interactiveEntryToolParams: lastInteractive?.toolParams,
        body: {
          messages: adaptMessages,
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
        onToolParam({ tool, params }) {
          workflowStreamResponse?.({
            event: SseResponseEventEnum.toolParams,
            data: {
              tool: {
                id: tool.id,
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

          const { response, usages, isEnd } = await (async () => {
            if (toolId === SubAppIds.stop) {
              return {
                response: '',
                usages: [],
                isEnd: true
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
                  workflowStreamResponse
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
          })();
          // } else if (toolId === SubAppIds.plan) {
          //   const planModel = planConfig?.model ?? model;
          //   const { instruction } = parseToolArgs<{ instruction: string }>(call.function.arguments);

          //   const { content, inputTokens, outputTokens } = await transferPlanAgent({
          //     model: planModel,
          //     instruction,
          //     histories: GPTMessages2Chats({
          //       messages: context.slice(1, -1),
          //       getToolInfo
          //     }),
          //     onStreaming({ text }) {
          //       //TODO: 需要一个新的 plan sse event
          //       workflowStreamResponse?.({
          //         event: SseResponseEventEnum.toolResponse,
          //         data: {
          //           tool: {
          //             id: call.id,
          //             toolName: '',
          //             toolAvatar: '',
          //             params: '',
          //             response: sliceStrStartEnd(fullText, 5000, 5000)
          //           }
          //         }
          //       });
          //     }
          //   });

          //   const lastPlanCallIndex = context
          //     .slice(0, -1)
          //     .findLastIndex(
          //       (c) =>
          //         c.role === 'assistant' &&
          //         c.tool_calls?.some((tc) => tc.function?.name === SubAppIds.plan)
          //     );
          //   const originalContent =
          //     lastPlanCallIndex !== -1 ? (context[lastPlanCallIndex + 1].content as string) : '';

          //   const applyedContent = applyDiff({
          //     original: originalContent,
          //     patch: content
          //   });

          //   // workflowStreamResponse?.({
          //   //   event: SseResponseEventEnum.toolResponse,
          //   //   data: {
          //   //     tool: {
          //   //       id: call.id,
          //   //       toolName: '',
          //   //       toolAvatar: '',
          //   //       params: '',
          //   //       response: sliceStrStartEnd(applyedContent, 5000, 5000)
          //   //     }
          //   //   }
          //   // });

          //   return {
          //     response: content,
          //     usages: [],
          //     isEnd: false
          //   };
          // } else if (toolId === SubAppIds.model) {
          //   const { systemPrompt, task } = parseToolArgs<{ systemPrompt: string; task: string }>(
          //     call.function.arguments
          //   );

          //   const { content, inputTokens, outputTokens } = await transferModelAgent({
          //     model,
          //     systemPrompt,
          //     task,
          //     onStreaming({ text, fullText }) {
          //       if (!fullText) return;
          //       workflowStreamResponse?.({
          //         event: SseResponseEventEnum.toolResponse,
          //         data: {
          //           tool: {
          //             id: call.id,
          //             toolName: '',
          //             toolAvatar: '',
          //             params: '',
          //             response: sliceStrStartEnd(fullText, 5000, 5000)
          //           }
          //         }
          //       });
          //     }
          //   });
          //   return {
          //     response: content,
          //     usages: [],
          //     isEnd: false
          //   };
          // }

          // Push stream response
          workflowStreamResponse?.({
            event: SseResponseEventEnum.toolResponse,
            data: {
              tool: {
                id: call.id,
                toolName: '',
                toolAvatar: '',
                params: '',
                response: sliceStrStartEnd(response, 5000, 5000)
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
      data: {
        [NodeOutputKeyEnum.answerText]: previewAssistantResponses
          .filter((item) => item.text?.content)
          .map((item) => item.text?.content || '')
          .join('')
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
