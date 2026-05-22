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

/**
 * 将 OpenAI/GPT message role 映射为 FastGPT 内部聊天角色。
 * function/tool message 本质上属于 AI 轮次的工具上下文，因此统一归到 AI。
 */
export function adaptRole_Message2Chat(role: `${ChatCompletionRequestMessageRoleEnum}`) {
  return GPT2Chat[role];
}

/**
 * 压缩用户 content part：单纯文本保持旧版 string 结构，多模态或多段内容保留数组。
 * 这样既兼容历史文本模型上下文，又不会丢失图片/文件等结构化输入。
 */
export const simpleUserContentPart = (content: ChatCompletionContentPart[]) => {
  if (content.length === 1 && content[0].type === 'text') {
    return content[0].text;
  }
  return content;
};

// 获取最后一个压缩检查点的位置。检查点会替代它之前的普通上下文。
const getLatestCheckpointPosition = (messages: ChatItemMiniType[]) => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const item = messages[index];
    if (item.obj !== ChatRoleEnum.AI) continue;

    for (let valueIndex = item.value.length - 1; valueIndex >= 0; valueIndex--) {
      if (item.value[valueIndex].contextCheckpoint) {
        return {
          historyIndex: index,
          valueIndex
        };
      }
    }
  }

  return;
};

/**
 * 根据最后一个 contextCheckpoint 重建待请求的历史。
 * checkpoint 前只保留 System 历史，避免压缩后的上下文又叠加旧对话导致重复计入。
 */
const getCheckpointAwareMessages = (messages: ChatItemMiniType[]) => {
  const checkpointPosition = getLatestCheckpointPosition(messages);
  if (!checkpointPosition) return messages;

  // Checkpoint resets chat history, but leading system histories still describe the runtime.
  const systemMessages = messages
    .slice(0, checkpointPosition.historyIndex)
    .filter((item) => item.obj === ChatRoleEnum.System);

  const checkpointAndRecentMessages = messages
    .slice(checkpointPosition.historyIndex)
    .map((item, index) => {
      if (index !== 0 || item.obj !== ChatRoleEnum.AI) return item;

      return {
        ...item,
        value: item.value.slice(checkpointPosition.valueIndex)
      };
    });

  return [...systemMessages, ...checkpointAndRecentMessages];
};

/**
 * 规整 assistant 拆分字段消息。
 *
 * FastGPT 历史为了 UI 展示会把 reasoning、text、tools 拆成多个 value；转成 GPT message
 * 时需要合并为 provider 能接受的 assistant message：
 * - reasoning 不能作为孤立 assistant item 发送，必须附着到后续 text/tool/function payload。
 * - 连续 reasoning 可以合并，reasoning 后接 text/tool_calls 时附着到同一个 assistant message。
 * - dataId/hideInUI 不同表示来自不同轮次或不同可见性上下文，不能跨边界合并。
 * - 没有可附着目标的孤立 reasoning 会被丢弃，避免生成只有 reasoning_content 的非法上下文。
 */
export const mergeAssistantFieldMessages = (messages: ChatCompletionMessageParam[]) => {
  type AssistantToolCallMessage = Extract<ChatCompletionMessageParam, { role: 'assistant' }> & {
    tool_calls: ChatCompletionMessageToolCall[];
  };

  type ToolMessage = Extract<ChatCompletionMessageParam, { role: 'tool' }> & {
    tool_call_id: string;
  };

  // 多段 reasoning 代表同一次 assistant payload 的连续思考，使用空行拼接便于 UI 和上下文阅读。
  const appendSeparatedText = (current: string | undefined, next: string) => {
    if (!next) return current;
    return current ? `${current}\n\n${next}` : next;
  };

  const hasAssistantToolCalls = (message: ChatCompletionMessageParam) =>
    message.role === ChatCompletionRequestMessageRoleEnum.Assistant &&
    Array.isArray(message.tool_calls) &&
    message.tool_calls.length > 0;

  const hasAssistantFunctionCall = (message: ChatCompletionMessageParam) =>
    message.role === ChatCompletionRequestMessageRoleEnum.Assistant &&
    Boolean(message.function_call);

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

    const hasNoAssistantText =
      message.content === undefined || message.content === null || message.content === '';

    return (
      hasAssistantToolCalls(message) &&
      hasNoAssistantText &&
      typeof message.reasoning_content !== 'string'
    );
  };

  const isToolResponseForToolCalls = (
    message: ChatCompletionMessageParam | undefined,
    toolCallIds: Set<string>
  ): message is ToolMessage =>
    message?.role === ChatCompletionRequestMessageRoleEnum.Tool &&
    toolCallIds.has(message.tool_call_id || '');

  const hasSameAssistantContext = (
    message: ChatCompletionMessageParam | undefined,
    assistantMessage: ChatCompletionMessageParam
  ) =>
    (message?.hideInUI ?? false) === (assistantMessage.hideInUI ?? false) &&
    message?.dataId === assistantMessage.dataId;

  const mergedMessages: ChatCompletionMessageParam[] = [];

  for (let index = 0; index < messages.length; index++) {
    const currentMessage = messages[index];
    if (!isAssistantFieldMessage(currentMessage)) {
      mergedMessages.push(currentMessage);
      continue;
    }

    const assistantMessage: ChatCompletionMessageParam = { ...currentMessage };
    let cursor = index + 1;

    // 先吞掉同一轮连续的 assistant 字段消息，例如 reasoning -> reasoning -> text。
    while (isAssistantFieldMessage(messages[cursor])) {
      const nextMessage = messages[cursor];
      if (!hasSameAssistantContext(nextMessage, assistantMessage)) break;

      const nextReasoning =
        typeof nextMessage.reasoning_content === 'string' ? nextMessage.reasoning_content : '';
      const nextContent = typeof nextMessage.content === 'string' ? nextMessage.content : '';

      // text 后再次出现 reasoning 通常已经是下一段思考，不能挂回前一个 answer。
      if (nextReasoning && typeof assistantMessage.content === 'string') {
        break;
      }

      if (nextReasoning) {
        assistantMessage.reasoning_content = appendSeparatedText(
          typeof assistantMessage.reasoning_content === 'string'
            ? assistantMessage.reasoning_content
            : undefined,
          nextReasoning
        );
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

    // 再把紧随其后的 tool_calls 与它们的 tool response 合并到同一个 assistant payload。
    let assistantToolMessage: ChatCompletionMessageParam | undefined = messages[cursor];
    while (isAssistantToolCallMessage(assistantToolMessage)) {
      if (!hasSameAssistantContext(assistantToolMessage, assistantMessage)) break;

      const currentToolCalls = assistantToolMessage.tool_calls;
      const currentToolCallIds = new Set(currentToolCalls.map((toolCall) => toolCall.id));
      const currentToolResponses: ChatCompletionMessageParam[] = [];
      let responseCursor = cursor + 1;

      // 只消费属于当前 tool_calls 的 response，防止把下一轮工具结果串进来。
      while (isToolResponseForToolCalls(messages[responseCursor], currentToolCallIds)) {
        currentToolResponses.push(messages[responseCursor]);
        responseCursor++;
      }

      toolCalls.push(...currentToolCalls);
      toolResponses.push(...currentToolResponses);
      cursor = responseCursor;
      assistantToolMessage = messages[cursor];
    }

    if (!toolCalls.length) {
      // 孤立 reasoning 没有可发给 provider 的合法载体；只有 text/function_call 才保留。
      if (
        typeof assistantMessage.content === 'string' ||
        hasAssistantFunctionCall(assistantMessage)
      ) {
        mergedMessages.push(assistantMessage);
      }
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

/**
 * 将 FastGPT 内部 ChatItem 历史转换为 GPT request messages。
 *
 * 关键约定：
 * - reserveTool=false 时只保留自然语言上下文，不把历史工具调用带入分类/普通对话。
 * - reserveReason=false 时去掉 reasoning_content，适用于问题分类等不需要思考过程的节点。
 * - reserveId=true 时保留 dataId，供需要按轮次追踪的调用方使用。
 * - 输出前会调用 mergeAssistantFieldMessages，保证 reasoning 不以独立 assistant message 出现。
 */
export const chats2GPTMessages = ({
  messages,
  reserveId,
  reserveTool = false,
  reserveReason = true
}: {
  messages: ChatItemMiniType[];
  reserveId: boolean;
  reserveTool?: boolean;
  reserveReason?: boolean;
}): ChatCompletionMessageParam[] => {
  let results: ChatCompletionMessageParam[] = [];
  const sourceMessages = getCheckpointAwareMessages(messages);

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
  sourceMessages.forEach((item) => {
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
      // agentAsk 的用户回答以交互记录形式存在，需要按 planId 恢复为 ask_agent tool response。
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
        reasoningText,
        hideInUI
      }: {
        id: string;
        functionName: string;
        params: string;
        assistantText?: string;
        reasoningText?: string;
        hideInUI?: boolean;
      }) => {
        const normalizedToolContext = normalizeChatToolContext({
          id,
          functionName,
          params,
          response: ''
        });

        if (reasoningText) appendAssistantReasoning(reasoningText, hideInUI);
        if (assistantText) appendAssistantText(assistantText, hideInUI);
        if (!normalizedToolContext) {
          // tool 元数据不完整时，保留前置 assistantText/reasoning，丢弃非法 tool_call。
          return false;
        }

        aiResults.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          ...(hideInUI ? { hideInUI } : {}),
          tool_calls: [normalizedToolContext.toolCall]
        });
        return normalizedToolContext;
      };

      const appendAssistantReasoning = (content: string, hideInUI?: boolean) => {
        if (!reserveReason || !content) return;

        aiResults.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          ...(hideInUI ? { hideInUI } : {}),
          reasoning_content: content
        });
      };

      const appendAssistantText = (content: string, hideInUI?: boolean) => {
        if (!content && item.value.length > 1) return;

        aiResults.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          ...(hideInUI ? { hideInUI } : {}),
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
        if (value.contextCheckpoint) {
          // checkpoint 会重置之前累积的 AI 字段；同一个 value 上的其他字段不再参与上下文。
          results = results.concat(mergeAssistantFieldMessages(aiResults));
          aiResults.length = 0;
          results.push({
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: value.contextCheckpoint,
            hideInUI: true
          });
          return;
        }

        // agent plan card
        if (reserveTool && value.agentPlanUpdate) {
          const appendedToolCall = appendAssistantToolCall({
            id: value.agentPlanUpdate.id,
            functionName: value.agentPlanUpdate.functionName,
            params: value.agentPlanUpdate.params,
            assistantText: value.agentPlanUpdate.assistantText,
            reasoningText: value.agentPlanUpdate.reasoningText,
            hideInUI: value.hideInUI
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
            reasoningText: value.agentAsk.reasoningText,
            hideInUI: value.hideInUI
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
            appendAssistantReasoning(value.agentStopGate.reasoningText, value.hideInUI);
          if (value.agentStopGate.assistantText)
            appendAssistantText(value.agentStopGate.assistantText, value.hideInUI);
          aiResults.push({
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: value.agentStopGate.feedback
          });
        }

        if (typeof value.reasoning?.content === 'string') {
          appendAssistantReasoning(value.reasoning.content, value.hideInUI);
        }

        if (typeof value.text?.content === 'string') {
          appendAssistantText(value.text.content, value.hideInUI);
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
              ...(value.hideInUI ? { hideInUI: value.hideInUI } : {}),
              tool_calls
            };

            aiResults.push(assistantMessage);
            aiResults.push(...toolResponse);
          }
        }
      });

      // AI value 遍历结束后统一合并，处理 reasoning/text/tools 分散存储的兼容格式。
      results = results.concat(mergeAssistantFieldMessages(aiResults));
    }
  });

  return results;
};

/**
 * 将 GPT messages 转回 FastGPT ChatItem。
 *
 * GPTMessages2Chats 只恢复当前 message 已经聚合好的结构，不再跨 message 追踪 reasoning。
 * reasoning_content 必须和 content/tool_calls/function_call 在同一个 assistant message 上才会恢复；
 * 孤立 reasoning 会被过滤，避免把下一轮或未知归属的思考过程误挂到后续消息。
 */
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
                  name: item.name || '',
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
        const valueVisibility = item.hideInUI ? { hideInUI: item.hideInUI } : {};
        const assistantValue: AIChatItemValueItemType = {
          ...valueVisibility
        };

        // text、tools、function_call 和 reasoning 归在同一个 value，避免 UI/历史再产生独立 reason item。
        if (typeof item.content === 'string' && item.content) {
          assistantValue.text = {
            content: item.content
          };
        }
        if (item.tool_calls && reserveTool) {
          // tool response 存在于独立 tool message 中，这里按 tool_call_id 回查并折回 ChatItem.tools。
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
          if (tools.length) {
            assistantValue.tools = tools;
          }
        }
        if (item.function_call && reserveTool) {
          const functionCall = item.function_call as ChatCompletionMessageFunctionCall;
          const functionResponse = messages.find(
            (msg) =>
              msg.role === ChatCompletionRequestMessageRoleEnum.Function &&
              msg.name === item.function_call?.name
          ) as ChatCompletionFunctionMessageParam;

          if (functionResponse) {
            assistantValue.tool = {
              id: functionCall.id || '',
              toolName: functionCall.toolName || '',
              toolAvatar: functionCall.toolAvatar || '',
              functionName: functionCall.name,
              params: functionCall.arguments,
              response: functionResponse.content || ''
            };
          }
        }
        if (
          typeof item.reasoning_content === 'string' &&
          item.reasoning_content &&
          reserveReason &&
          (assistantValue.text || assistantValue.tools || assistantValue.tool)
        ) {
          assistantValue.reasoning = {
            content: item.reasoning_content
          };
        }
        if (assistantValue.text || assistantValue.tools || assistantValue.tool) {
          value.push(assistantValue);
        }
        if (item.interactive) {
          value.push({
            interactive: item.interactive,
            ...valueVisibility
          });
        }

        return {
          dataId: item.dataId,
          obj,
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

  // 相邻同 dataId/obj 的记录归并，保持一轮 AI 多个 value 在同一个 ChatItem 中展示。
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

/**
 * 将聊天 value 提取成运行时用户输入。文件保留结构，文本按展示顺序拼接。
 */
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

/**
 * 将运行时 prompt 恢复为用户聊天 value，主要用于调试/重放入口。
 */
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

/**
 * 用一条 System ChatItem 包装系统提示词，便于统一走 ChatItem -> GPT message 转换链。
 */
export const getSystemPrompt_ChatItemType = (prompt?: string): ChatItemMiniType[] => {
  if (!prompt) return [];
  return [
    {
      obj: ChatRoleEnum.System,
      value: [{ text: { content: prompt } }]
    }
  ];
};
