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
import { getPlanCallResponseText } from './utils';

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
 * function/tool message 是 assistant 工具上下文的一部分，因此统一归到 AI 角色。
 */
export function adaptRole_Message2Chat(role: `${ChatCompletionRequestMessageRoleEnum}`) {
  return GPT2Chat[role];
}

/**
 * 压缩用户 content part：纯文本保持旧版 string，多模态或多段内容保留数组。
 * 这样既兼容历史文本上下文，也不会丢失图片、文件等结构化输入。
 */
export const simpleUserContentPart = (content: ChatCompletionContentPart[]) => {
  if (content.length === 1 && content[0].type === 'text') {
    return content[0].text;
  }
  return content;
};

/**
 * 规整 assistant 拆分字段消息。
 *
 * FastGPT 历史可能把 reasoning、text、tools 拆成多个 value；转成 GPT message 时需要
 * 重新合并成 provider 能接受的 assistant payload：
 * - reasoning 不能作为孤立 assistant message 发送，必须附着到后续 text/tool/function。
 * - 连续 reasoning 使用空行拼接，再附着到同一轮的后续载体上。
 * - dataId/hideInUI 不同表示不同上下文边界，不能跨边界合并。
 * - 没有可附着目标的孤立 reasoning 会被丢弃，避免生成非法上下文。
 */
export const mergeAssistantFieldMessages = (messages: ChatCompletionMessageParam[]) => {
  type AssistantToolCallMessage = Extract<ChatCompletionMessageParam, { role: 'assistant' }> & {
    tool_calls: ChatCompletionMessageToolCall[];
  };

  type ToolMessage = Extract<ChatCompletionMessageParam, { role: 'tool' }> & {
    tool_call_id: string;
  };

  // 多段 reasoning 属于同一个待发送 payload 时，用空行拼接，便于上下文阅读。
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

    // 先消费同一上下文内连续的 assistant 字段消息，例如 reasoning -> reasoning -> text。
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

    // 再消费紧随其后的 tool_calls 与对应 tool response，恢复为一个 assistant payload。
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
      // 孤立 reasoning 没有合法载体；只有 text/function_call 才能保留。
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
 * - reserveReason=false 时去掉 reasoning_content，适用于问题分类、内容提取等不需要思考过程的节点。
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
        // 有 planId 的过滤掉，会被 planTool 一起处理
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

      item.value.forEach((value) => {
        /* Plan agent 产生的上下文都需要合并到一个 toolCall 里。
          Plan agent 产生的上下文都会携带 planId
          value.plan 代表的是 plan 的具体内容，根据这个值去转化成 toolcall
        */
        if (value.planId && !value.plan) return;

        const hasTools = Array.isArray(value.tools) && value.tools.length > 0;

        if (reserveReason && typeof value.reasoning?.content === 'string') {
          aiResults.push({
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.Assistant,
            reasoning_content: value.reasoning.content
          });
        }

        // 同一个 value 同时有 text/tool 时，text 必须先入队，后续 merge 才能还原成
        // assistant(content + tool_calls) 的合法结构。
        if (typeof value.text?.content === 'string') {
          if (!value.text.content && item.value.length > 1) {
            return;
          }
          aiResults.push({
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.Assistant,
            content: value.text.content
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

          aiResults.push({
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.Assistant,
            tool_calls
          });

          aiResults.push(...toolResponse);
        }
        if (value.plan) {
          // 查找该 Plan 产生的上下文，组成一个 toolcall
          // 需要跨所有历史消息收集同 planId 的 values（ask 信息可能在之前的 AI 消息中）
          const planId = value.plan.planId;
          const allPlanValues = messages
            .filter((msg) => msg.obj === ChatRoleEnum.AI)
            .flatMap((msg) =>
              (msg.value as AIChatItemValueItemType[]).filter((v) => v.planId === planId)
            );
          const planResponseText = getPlanCallResponseText({
            plan: value.plan,
            assistantResponses: allPlanValues
          });
          aiResults.push({
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.Assistant,
            tool_calls: [
              {
                id: planId,
                type: 'function',
                function: {
                  name: 'plan_agent',
                  arguments: JSON.stringify({
                    task: value.plan.task,
                    description: value.plan.description,
                    background: value.plan.background
                  })
                }
              }
            ]
          });
          aiResults.push({
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.Tool,
            tool_call_id: planId,
            content: planResponseText
          });
        }
        if (value.interactive) {
          // 目前只有 plan 里会有交互，所以这里暂时不需要处理
        }
      });

      results = results.concat(mergeAssistantFieldMessages(aiResults));
    }
  });

  return results;
};

/**
 * 将 GPT messages 转回 FastGPT ChatItem。
 *
 * GPTMessages2Chats 只恢复当前 message 已经聚合好的结构，不跨 message 追踪 reasoning。
 * reasoning_content 必须和 content/tool_calls/function_call 在同一个 assistant message 上才会恢复；
 * 孤立 reasoning 会被过滤，避免把下一轮或未知归属的思考误挂到后续消息。
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
  getToolInfo?: (name: string) => { name: string; avatar: string };
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
        const assistantValue: AIChatItemValueItemType = {};

        if (typeof item.content === 'string' && item.content) {
          assistantValue.text = {
            content: item.content
          };
        }
        if (item.tool_calls && reserveTool) {
          const toolCalls = item.tool_calls as ChatCompletionMessageToolCall[];

          const tools = toolCalls.flatMap<ToolModuleResponseItemType>((tool) => {
            // Skil plan tool
            if (tool.function.name === 'plan_agent') {
              return [];
            }
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
          assistantValue.tools = tools;
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
