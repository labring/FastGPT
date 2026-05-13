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

export const mergeAssistantFieldMessages = (messages: ChatCompletionMessageParam[]) => {
  type AssistantToolCallMessage = Extract<ChatCompletionMessageParam, { role: 'assistant' }> & {
    tool_calls: ChatCompletionMessageToolCall[];
  };

  type ToolMessage = Extract<ChatCompletionMessageParam, { role: 'tool' }> & {
    tool_call_id: string;
  };

  const isAssistantFieldMessage = (message?: ChatCompletionMessageParam) => {
    if (message?.role !== ChatCompletionRequestMessageRoleEnum.Assistant) return false;

    return (
      !message.tool_calls &&
      (typeof message.content === 'string' || typeof message.reasoning_content === 'string')
    );
  };

  const isAssistantToolCallMessage = (
    message?: ChatCompletionMessageParam
  ): message is AssistantToolCallMessage => {
    if (message?.role !== ChatCompletionRequestMessageRoleEnum.Assistant) return false;

    return (
      Array.isArray(message.tool_calls) &&
      message.tool_calls.length > 0 &&
      typeof message.content !== 'string' &&
      typeof message.reasoning_content !== 'string'
    );
  };

  const isToolResponseForToolCalls = (
    message: ChatCompletionMessageParam | undefined,
    toolCallIds: Set<string>
  ): message is ToolMessage =>
    message?.role === ChatCompletionRequestMessageRoleEnum.Tool &&
    toolCallIds.has(message.tool_call_id || '');

  const mergedMessages: ChatCompletionMessageParam[] = [];

  for (let index = 0; index < messages.length; index++) {
    const currentMessage = messages[index];
    if (!isAssistantFieldMessage(currentMessage)) {
      mergedMessages.push(currentMessage);
      continue;
    }

    const assistantMessage: ChatCompletionMessageParam = { ...currentMessage };
    let cursor = index + 1;

    while (isAssistantFieldMessage(messages[cursor])) {
      const nextMessage = messages[cursor];
      const nextReasoning =
        typeof nextMessage.reasoning_content === 'string' ? nextMessage.reasoning_content : '';
      const nextContent = typeof nextMessage.content === 'string' ? nextMessage.content : '';

      if (
        nextReasoning &&
        (typeof assistantMessage.reasoning_content === 'string' ||
          typeof assistantMessage.content === 'string')
      ) {
        break;
      }

      if (nextReasoning) {
        assistantMessage.reasoning_content = nextReasoning;
      }

      if (typeof nextMessage.content === 'string') {
        if (typeof assistantMessage.content === 'string') {
          assistantMessage.content += nextContent;
        } else {
          assistantMessage.content = nextContent;
        }
      }

      cursor++;
    }

    const toolCalls: ChatCompletionMessageToolCall[] = [];
    const toolResponses: ChatCompletionMessageParam[] = [];

    let assistantToolMessage: ChatCompletionMessageParam | undefined = messages[cursor];
    while (isAssistantToolCallMessage(assistantToolMessage)) {
      const currentToolCalls = assistantToolMessage.tool_calls;
      const currentToolCallIds = new Set(currentToolCalls.map((toolCall) => toolCall.id));
      const currentToolResponses: ChatCompletionMessageParam[] = [];
      let responseCursor = cursor + 1;

      while (isToolResponseForToolCalls(messages[responseCursor], currentToolCallIds)) {
        currentToolResponses.push(messages[responseCursor]);
        responseCursor++;
      }

      if (!currentToolResponses.length) break;

      toolCalls.push(...currentToolCalls);
      toolResponses.push(...currentToolResponses);
      cursor = responseCursor;
      assistantToolMessage = messages[cursor];
    }

    if (!toolCalls.length) {
      mergedMessages.push(assistantMessage);
      index = cursor - 1;
      continue;
    }

    mergedMessages.push({
      ...assistantMessage,
      tool_calls: toolCalls
    } as ChatCompletionMessageParam);
    mergedMessages.push(...toolResponses);
    index = cursor - 1;
  }

  return mergedMessages;
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

  const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

  const normalizeToolArguments = (params: unknown) => {
    if (typeof params === 'string') {
      return params || '{}';
    }

    try {
      return JSON.stringify(params ?? {});
    } catch {
      return '{}';
    }
  };

  type NormalizedChatToolContext = {
    toolCall: ChatCompletionMessageToolCall;
    toolResponse: ChatCompletionToolMessageParam;
  };
  const isNormalizedChatToolContext = (
    item: NormalizedChatToolContext | undefined
  ): item is NormalizedChatToolContext => Boolean(item);

  const normalizeChatToolContext = (
    tool?: Partial<ToolModuleResponseItemType> | null
  ): NormalizedChatToolContext | undefined => {
    if (!tool || !isNonEmptyString(tool.id) || !isNonEmptyString(tool.functionName)) {
      return;
    }

    const id = tool.id.trim();
    const functionName = tool.functionName.trim();

    return {
      toolCall: {
        id,
        type: 'function' as const,
        function: {
          name: functionName,
          arguments: normalizeToolArguments(tool.params)
        }
      },
      toolResponse: {
        tool_call_id: id,
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        content: typeof tool.response === 'string' ? tool.response : ''
      }
    };
  };

  messages.forEach((item) => {
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
        const normalizedToolContext = normalizeChatToolContext({
          id,
          functionName,
          params,
          response: ''
        });

        if (reasoningText) appendAssistantReasoning(reasoningText);
        if (assistantText) appendAssistantText(assistantText);
        if (!normalizedToolContext) {
          return false;
        }

        aiResults.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          tool_calls: [normalizedToolContext.toolCall]
        });
        return normalizedToolContext;
      };

      const appendAssistantReasoning = (content: string) => {
        aiResults.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          reasoning_content: content
        });
      };

      const appendAssistantText = (content: string) => {
        if (!content && item.value.length > 1) return;

        aiResults.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          content
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
        // agent plan card
        if (reserveTool && value.agentPlanUpdate) {
          const appendedToolCall = appendAssistantToolCall({
            id: value.agentPlanUpdate.id,
            functionName: value.agentPlanUpdate.functionName,
            params: value.agentPlanUpdate.params,
            assistantText: value.agentPlanUpdate.assistantText,
            reasoningText: value.agentPlanUpdate.reasoningText
          });
          if (appendedToolCall && typeof value.agentPlanUpdate.response === 'string') {
            appendToolMessage({
              id: appendedToolCall.toolCall.id,
              response: value.agentPlanUpdate.response
            });
          }
        }

        // Agent ask tool
        if (reserveTool && value.agentAsk) {
          const appendedToolCall = appendAssistantToolCall({
            id: value.agentAsk.id,
            functionName: value.agentAsk.functionName,
            params: value.agentAsk.params,
            assistantText: value.agentAsk.assistantText,
            reasoningText: value.agentAsk.reasoningText
          });
          const answer = value.agentAsk.planId
            ? agentAskAnswerMap.get(value.agentAsk.planId)
            : undefined;
          if (appendedToolCall && typeof answer === 'string') {
            appendToolMessage({
              id: appendedToolCall.toolCall.id,
              response: answer
            });
          }
        }

        // Stop tool
        if (reserveTool && value.agentStopGate) {
          if (value.agentStopGate.reasoningText)
            appendAssistantReasoning(value.agentStopGate.reasoningText);
          if (value.agentStopGate.assistantText)
            appendAssistantText(value.agentStopGate.assistantText);
          aiResults.push({
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: value.agentStopGate.feedback
          });
        }

        if (typeof value.reasoning?.content === 'string') {
          appendAssistantReasoning(value.reasoning.content);
        }

        if (typeof value.text?.content === 'string') {
          appendAssistantText(value.text.content);
        }

        const tools = value.tools ? value.tools : value.tool ? [value.tool] : undefined;
        const hasTools = Array.isArray(tools) && tools.length > 0;

        if (reserveTool && hasTools) {
          const normalizedToolContexts = tools
            .map((tool) => normalizeChatToolContext(tool))
            .filter(isNormalizedChatToolContext);

          // 清除无效 tool 后，还有 tool 才推送
          if (normalizedToolContexts.length) {
            const tool_calls = normalizedToolContexts.map((item) => item.toolCall);
            const toolResponse = normalizedToolContexts.map((item) => item.toolResponse);

            const assistantMessage: ChatCompletionMessageParam = {
              dataId,
              role: ChatCompletionRequestMessageRoleEnum.Assistant,
              tool_calls
            };

            aiResults.push(assistantMessage);
            aiResults.push(...toolResponse);
          }
        }
        // 暂不处理
        if (value.interactive) {
        }
      });

      // Auto add empty assistant message
      results = results.concat(mergeAssistantFieldMessages(aiResults));
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
