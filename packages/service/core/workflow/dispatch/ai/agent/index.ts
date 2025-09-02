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
  ModuleDispatchProps
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
  filterToolResponseToPreview,
  formatToolResponse,
  getToolNodesByIds,
  initToolNodes
} from '../utils';
import { getTopAgentDefaultPrompt, StopAgentId, StopAgentTool } from './constants';
import { runWorkflow } from '../..';
import json5 from 'json5';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import type { ToolNodeItemType } from './type';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';

export type DispatchAgentModuleProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.history]?: ChatItemType[];
  [NodeInputKeyEnum.userChatInput]: string;

  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]: string;
  [NodeInputKeyEnum.aiChatTemperature]: number;
  [NodeInputKeyEnum.aiChatTopP]?: number;

  [NodeInputKeyEnum.subAgentConfig]?: Record<string, any>;
  [NodeInputKeyEnum.planAgentConfig]?: Record<string, any>;
  [NodeInputKeyEnum.modelAgentConfig]?: Record<string, any>;
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
      aiChatTopP
    }
  } = props;

  try {
    const agentModel = getLLMModel(model);
    const chatHistories = getHistories(history, histories);

    const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
    if (!fileUrlInput || !fileUrlInput.value || fileUrlInput.value.length === 0) {
      fileLinks = undefined;
    }

    // Init tool params
    const toolNodeIds = filterToolNodeIdByEdges({ nodeId, edges: runtimeEdges });
    const toolNodes = getToolNodesByIds({ toolNodeIds, runtimeNodes });
    // TODO: 补充系统 agent
    const toolNodesMap = new Map<string, ToolNodeItemType>();
    toolNodes.forEach((item) => {
      toolNodesMap.set(item.nodeId, item);
    });
    const getToolInfo = (id: string) => {
      const toolNode = toolNodesMap.get(id);
      return {
        name: toolNode?.name || '',
        avatar: toolNode?.avatar || ''
      };
    };

    const subApps = getSubApps({ toolNodes });

    // TODO: 把 files 加入 query 中。
    const messages: ChatItemType[] = (() => {
      const value: ChatItemType[] = [
        ...getSystemPrompt_ChatItemType(systemPrompt || getTopAgentDefaultPrompt()),
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
          subApps
        },

        userKey: externalProvider.openaiAccount,
        isAborted: res ? () => res.closed : undefined,

        getToolInfo,
        handleToolResponse: async (call) => {
          const toolId = call.function.name;

          if (toolId === StopAgentId) {
            return {
              response: '',
              usages: [],
              isEnd: true
            };
          }

          const node = toolNodesMap.get(toolId);
          if (!node) {
            return {
              response: 'Can not find the tool',
              usages: [],
              isEnd: false
            };
          }

          const startParams = (() => {
            try {
              return json5.parse(call.function.arguments);
            } catch {
              return {};
            }
          })();

          initToolNodes(runtimeNodes, [node.nodeId], startParams);
          const { toolResponses, flowUsages, flowResponses } = await runWorkflow({
            ...props,
            isToolCall: true
          });
          dispatchFlowResponse.push(...flowResponses);

          const response = formatToolResponse(toolResponses);
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
            usages: flowUsages,
            isEnd: false
          };
        },

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

const getSubApps = ({ toolNodes }: { toolNodes: ToolNodeItemType[] }): ChatCompletionTool[] => {
  // System Tools: Plan Agent, stop sign, model agent.
  const systemTools: ChatCompletionTool[] = [];

  // Node Tools
  const nodeTools = toolNodes.map<ChatCompletionTool>((item: ToolNodeItemType) => {
    if (item.jsonSchema) {
      return {
        type: 'function',
        function: {
          name: item.nodeId,
          description: item.intro || item.name,
          parameters: item.jsonSchema
        }
      };
    }

    const properties: Record<string, any> = {};
    item.toolParams.forEach((param) => {
      const jsonSchema = param.valueType
        ? valueTypeJsonSchemaMap[param.valueType] || toolValueTypeList[0].jsonSchema
        : toolValueTypeList[0].jsonSchema;

      properties[param.key] = {
        ...jsonSchema,
        description: param.toolDescription || '',
        enum: param.enum?.split('\n').filter(Boolean) || undefined
      };
    });

    return {
      type: 'function',
      function: {
        name: item.nodeId,
        description: item.toolDescription || item.intro || item.name,
        parameters: {
          type: 'object',
          properties,
          required: item.toolParams.filter((param) => param.required).map((param) => param.key)
        }
      }
    };
  });

  return [...systemTools, ...nodeTools];
};
