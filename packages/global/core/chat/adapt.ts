import type {
  AIChatItemValueItemType,
  ChatItemMiniType,
  ChatItemValueItemType,
  RuntimeUserPromptType,
  SystemChatItemValueItemType,
  ToolModuleResponseItemType,
  UserChatItemFileItemType,
  UserChatItemType,
  UserChatItemValueItemType
} from './type';
import { ChatFileTypeEnum, ChatRoleEnum } from '../../core/chat/constants';
import type {
  ChatCompletionContentPart,
  ChatCompletionFunctionMessageParam,
  ChatCompletionMessageFunctionCall,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam
} from '../ai/llm/type';
import { ChatCompletionRequestMessageRoleEnum } from '../../core/ai/constants';

export const GPT2Chat = {
  [ChatCompletionRequestMessageRoleEnum.System]: ChatRoleEnum.System,
  [ChatCompletionRequestMessageRoleEnum.Developer]: ChatRoleEnum.System,
  [ChatCompletionRequestMessageRoleEnum.User]: ChatRoleEnum.Human,
  [ChatCompletionRequestMessageRoleEnum.Assistant]: ChatRoleEnum.AI,
  [ChatCompletionRequestMessageRoleEnum.Function]: ChatRoleEnum.AI,
  [ChatCompletionRequestMessageRoleEnum.Tool]: ChatRoleEnum.AI
};

export function adaptRole_Message2Chat(role: `${ChatCompletionRequestMessageRoleEnum}`) {
  return GPT2Chat[role];
}

export const simpleUserContentPart = (content: ChatCompletionContentPart[]) => {
  if (content.length === 1 && content[0].type === 'text') {
    return content[0].text;
  }
  return content;
};

export const chats2GPTMessages = ({
  messages,
  reserveId,
  reserveTool = false
}: {
  messages: ChatItemMiniType[];
  reserveId: boolean;
  reserveTool?: boolean;
}): ChatCompletionMessageParam[] => {
  let results: ChatCompletionMessageParam[] = [];

  messages.forEach((item, index) => {
    const dataId = reserveId ? item.dataId : undefined;
    if (item.obj === ChatRoleEnum.System) {
      const content = item.value?.[0]?.text?.content;
      if (content) {
        results.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.System,
          content
        });
      }
    } else if (item.obj === ChatRoleEnum.Human) {
      const value = item.value
        // Agent 追问的用户答案会通过当轮 pendingMainContext 恢复为 ask_agent 的 tool response。
        // 带 planId 的历史用户消息只作为 UI 记录保存，不再重复塞进普通对话上下文。
        .filter((item) => !item.planId)
        .map((item) => {
          if (item.text) {
            return {
              type: 'text',
              text: item.text?.content || ''
            };
          }
          if (item.file) {
            if (item.file?.type === ChatFileTypeEnum.image) {
              return {
                type: 'image_url',
                key: item.file.key,
                image_url: {
                  url: item.file.url
                }
              };
            } else if (item.file?.type === ChatFileTypeEnum.file) {
              return {
                type: 'file_url',
                name: item.file?.name || '',
                url: item.file.url,
                key: item.file.key
              };
            }
          }
        })
        .filter(Boolean) as ChatCompletionContentPart[];

      if (value.length) {
        results.push({
          dataId,
          hideInUI: item.hideInUI,
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: simpleUserContentPart(value)
        });
      }
    } else {
      const aiResults: ChatCompletionMessageParam[] = [];
      const agentAskAnswerMap = new Map<string, string>();
      item.value.forEach((value) => {
        if (
          value.interactive?.type === 'agentPlanAskQuery' &&
          value.interactive.planId &&
          typeof value.interactive.params.answer === 'string'
        ) {
          agentAskAnswerMap.set(value.interactive.planId, value.interactive.params.answer);
        }
      });

      const appendAssistantToolCall = ({
        id,
        functionName,
        params,
        assistantText,
        reasoningText
      }: {
        id: string;
        functionName: string;
        params: string;
        assistantText?: string;
        reasoningText?: string;
      }) => {
        aiResults.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          ...(assistantText ? { content: assistantText } : {}),
          ...(reasoningText ? { reasoning_content: reasoningText } : {}),
          tool_calls: [
            {
              id,
              type: 'function',
              function: {
                name: functionName,
                arguments: params
              }
            }
          ]
        });
      };

      const appendToolMessage = ({ id, response }: { id: string; response: string }) => {
        aiResults.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          tool_call_id: id,
          content: response
        });
      };

      item.value.forEach((value) => {
        if (reserveTool && value.agentPlanUpdate) {
          appendAssistantToolCall({
            id: value.agentPlanUpdate.id,
            functionName: value.agentPlanUpdate.functionName,
            params: value.agentPlanUpdate.params,
            assistantText: value.agentPlanUpdate.assistantText,
            reasoningText: value.agentPlanUpdate.reasoningText
          });
          if (typeof value.agentPlanUpdate.response === 'string') {
            appendToolMessage({
              id: value.agentPlanUpdate.id,
              response: value.agentPlanUpdate.response
            });
          }
          return;
        }

        if (reserveTool && value.agentAsk) {
          appendAssistantToolCall({
            id: value.agentAsk.id,
            functionName: value.agentAsk.functionName,
            params: value.agentAsk.params,
            assistantText: value.agentAsk.assistantText,
            reasoningText: value.agentAsk.reasoningText
          });
          const answer = value.agentAsk.planId
            ? agentAskAnswerMap.get(value.agentAsk.planId)
            : undefined;
          if (typeof answer === 'string') {
            appendToolMessage({
              id: value.agentAsk.id,
              response: answer
            });
          }
          return;
        }

        if (reserveTool && value.agentStopGate) {
          if (value.agentStopGate.assistantText || value.agentStopGate.reasoningText) {
            aiResults.push({
              dataId,
              role: ChatCompletionRequestMessageRoleEnum.Assistant,
              ...(value.agentStopGate.assistantText
                ? { content: value.agentStopGate.assistantText }
                : {}),
              ...(value.agentStopGate.reasoningText
                ? { reasoning_content: value.agentStopGate.reasoningText }
                : {})
            });
          }
          aiResults.push({
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: value.agentStopGate.feedback
          });
          return;
        }

        const hasTools = Array.isArray(value.tools) && value.tools.length > 0;

        if (typeof value.reasoning?.content === 'string') {
          aiResults.push({
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.Assistant,
            reasoning_content: value.reasoning.content
          });
        }

        if (reserveTool && (hasTools || value.tool)) {
          const tools = hasTools ? value.tools! : [value.tool!];
          const tool_calls: ChatCompletionMessageToolCall[] = [];
          const toolResponse: ChatCompletionToolMessageParam[] = [];
          tools.forEach((tool) => {
            tool_calls.push({
              id: tool.id,
              type: 'function',
              function: {
                name: tool.functionName,
                arguments: tool.params
              }
            });
            toolResponse.push({
              tool_call_id: tool.id,
              role: ChatCompletionRequestMessageRoleEnum.Tool,
              content: tool.response || ''
            });
          });

          const lastResult = aiResults[aiResults.length - 1];
          if (
            lastResult &&
            lastResult.role === ChatCompletionRequestMessageRoleEnum.Assistant &&
            lastResult.reasoning_content
          ) {
            lastResult.tool_calls = tool_calls;
          } else {
            aiResults.push({
              dataId,
              role: ChatCompletionRequestMessageRoleEnum.Assistant,
              tool_calls
            });
          }

          aiResults.push(...toolResponse);
        }
        if (typeof value.text?.content === 'string') {
          if (!value.text.content && item.value.length > 1) {
            return;
          }
          // Concat text
          const lastResult = aiResults[aiResults.length - 1];
          if (
            lastResult?.role === ChatCompletionRequestMessageRoleEnum.Assistant &&
            typeof lastResult?.content === 'string'
          ) {
            lastResult.content += value.text.content;
          } else if (lastResult?.reasoning_content) {
            lastResult.content = value.text.content;
          } else {
            aiResults.push({
              dataId,
              role: ChatCompletionRequestMessageRoleEnum.Assistant,
              content: value.text.content
            });
          }
        }
        // Plan 卡片只是 UI 状态；update_plan/stop gate/ask_agent 会通过独立字段恢复上下文。
        // 这里不把历史 plan 伪造成 tool_call 注入模型上下文。
        if (value.interactive) {
          // 目前只有 plan 里会有交互，所以这里暂时不需要处理
        }
      });

      // Auto add empty assistant message
      results = results.concat(aiResults);
    }
  });

  return results;
};

export const GPTMessages2Chats = ({
  messages,
  reserveTool = true,
  reserveReason = true,
  getToolInfo
}: {
  messages: ChatCompletionMessageParam[];
  reserveTool?: boolean;
  reserveReason?: boolean;
  getToolInfo?: (name: string) => { name: string; avatar?: string } | undefined;
}): ChatItemMiniType[] => {
  const chatMessages = messages
    .map((item) => {
      const obj = GPT2Chat[item.role];

      if (
        obj === ChatRoleEnum.System &&
        item.role === ChatCompletionRequestMessageRoleEnum.System
      ) {
        const value: SystemChatItemValueItemType[] = [];

        if (Array.isArray(item.content)) {
          item.content.forEach((item) => [
            value.push({
              text: {
                content: item.text
              }
            })
          ]);
        } else {
          value.push({
            text: {
              content: item.content
            }
          });
        }
        return {
          dataId: item.dataId,
          obj,
          hideInUI: item.hideInUI,
          value
        };
      } else if (
        obj === ChatRoleEnum.Human &&
        item.role === ChatCompletionRequestMessageRoleEnum.User
      ) {
        const value: UserChatItemValueItemType[] = [];

        if (typeof item.content === 'string') {
          value.push({
            text: {
              content: item.content
            }
          });
        } else if (Array.isArray(item.content)) {
          item.content.forEach((item) => {
            if (item.type === 'text') {
              value.push({
                text: {
                  content: item.text
                }
              });
            } else if (item.type === 'image_url') {
              value.push({
                file: {
                  type: ChatFileTypeEnum.image,
                  name: '',
                  url: item.image_url.url,
                  key: item.key
                }
              });
            } else if (item.type === 'file_url') {
              value.push({
                file: {
                  type: ChatFileTypeEnum.file,
                  name: item.name,
                  url: item.url,
                  key: item.key
                }
              });
            }
          });
        }
        return {
          dataId: item.dataId,
          obj,
          hideInUI: item.hideInUI,
          value
        };
      } else if (
        obj === ChatRoleEnum.AI &&
        item.role === ChatCompletionRequestMessageRoleEnum.Assistant
      ) {
        const value: AIChatItemValueItemType[] = [];

        if (typeof item.reasoning_content === 'string' && item.reasoning_content && reserveReason) {
          value.push({
            reasoning: {
              content: item.reasoning_content
            }
          });
        }
        if (typeof item.content === 'string' && item.content) {
          const lastValue = value[value.length - 1];
          if (lastValue && lastValue.text) {
            lastValue.text.content += item.content;
          } else {
            value.push({
              text: {
                content: item.content
              }
            });
          }
        }
        if (item.tool_calls && reserveTool) {
          // save tool calls
          const toolCalls = item.tool_calls as ChatCompletionMessageToolCall[];

          const tools = toolCalls.flatMap<ToolModuleResponseItemType>((tool) => {
            let toolResponse =
              messages.find(
                (msg) =>
                  msg.role === ChatCompletionRequestMessageRoleEnum.Tool &&
                  msg.tool_call_id === tool.id
              )?.content || '';
            toolResponse =
              typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse);

            const toolInfo = getToolInfo?.(tool.function.name);

            return [
              {
                id: tool.id,
                toolName: toolInfo?.name || '',
                toolAvatar: toolInfo?.avatar || '',
                functionName: tool.function.name,
                params: tool.function.arguments,
                response: toolResponse as string
              }
            ];
          });
          value.push({
            tools
          });
        }
        if (item.function_call && reserveTool) {
          const functionCall = item.function_call as ChatCompletionMessageFunctionCall;
          const functionResponse = messages.find(
            (msg) =>
              msg.role === ChatCompletionRequestMessageRoleEnum.Function &&
              msg.name === item.function_call?.name
          ) as ChatCompletionFunctionMessageParam;

          if (functionResponse) {
            value.push({
              tool: {
                id: functionCall.id || '',
                toolName: functionCall.toolName || '',
                toolAvatar: functionCall.toolAvatar || '',
                functionName: functionCall.name,
                params: functionCall.arguments,
                response: functionResponse.content || ''
              }
            });
          }
        }
        if (item.interactive) {
          value.push({
            interactive: item.interactive
          });
        }

        return {
          dataId: item.dataId,
          obj,
          hideInUI: item.hideInUI,
          value
        };
      }

      return {
        dataId: item.dataId,
        obj,
        hideInUI: item.hideInUI,
        value: []
      };
    })
    .filter((item) => item.value.length > 0);

  // Merge data with the same dataId（Sequential obj merging）
  const result = chatMessages.reduce((result: ChatItemMiniType[], currentItem) => {
    const lastItem = result[result.length - 1];

    if (lastItem && lastItem.dataId === currentItem.dataId && lastItem.obj === currentItem.obj) {
      // @ts-ignore
      lastItem.value = lastItem.value.concat(currentItem.value);
    } else {
      result.push(currentItem);
    }

    return result;
  }, []);

  return result;
};

export const chatValue2RuntimePrompt = (value: ChatItemValueItemType[]): RuntimeUserPromptType => {
  const prompt: RuntimeUserPromptType = {
    files: [],
    text: ''
  };
  value.forEach((item) => {
    if ('file' in item && item.file) {
      prompt.files.push(item.file);
    } else if (item.text) {
      prompt.text += item.text.content;
    }
  });
  return prompt;
};

export const runtimePrompt2ChatsValue = (prompt: {
  files?: UserChatItemFileItemType[];
  text?: string;
}): UserChatItemType['value'] => {
  const value: UserChatItemType['value'] = [];
  if (prompt.files) {
    prompt.files.forEach((file) => {
      value.push({
        file
      });
    });
  }
  if (prompt.text) {
    value.push({
      text: {
        content: prompt.text
      }
    });
  }
  return value;
};

export const getSystemPrompt_ChatItemType = (prompt?: string): ChatItemMiniType[] => {
  if (!prompt) return [];
  return [
    {
      obj: ChatRoleEnum.System,
      value: [{ text: { content: prompt } }]
    }
  ];
};
