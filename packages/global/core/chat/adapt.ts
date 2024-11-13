import type {
  ChatItemType,
  ChatItemValueItemType,
  RuntimeUserPromptType,
  UserChatItemType
} from '../../core/chat/type.d';
import { ChatFileTypeEnum, ChatItemValueTypeEnum, ChatRoleEnum } from '../../core/chat/constants';
import type {
  ChatCompletionContentPart,
  ChatCompletionFunctionMessageParam,
  ChatCompletionMessageFunctionCall,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam
} from '../../core/ai/type.d';
import { ChatCompletionRequestMessageRoleEnum } from '../../core/ai/constants';
const GPT2Chat = {
  [ChatCompletionRequestMessageRoleEnum.System]: ChatRoleEnum.System,
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
  messages: ChatItemType[];
  reserveId: boolean;
  reserveTool?: boolean;
}): ChatCompletionMessageParam[] => {
  let results: ChatCompletionMessageParam[] = [];

  messages.forEach((item) => {
    const dataId = reserveId ? item.dataId : undefined;
    if (item.obj === ChatRoleEnum.Human) {
      const value = item.value
        .map((item) => {
          if (item.type === ChatItemValueTypeEnum.text) {
            return {
              type: 'text',
              text: item.text?.content || ''
            };
          }
          if (item.type === ChatItemValueTypeEnum.file) {
            if (item.file?.type === ChatFileTypeEnum.image) {
              return {
                type: 'image_url',
                image_url: {
                  url: item.file.url
                }
              };
            } else if (item.file?.type === ChatFileTypeEnum.file) {
              return {
                type: 'file_url',
                name: item.file?.name || '',
                url: item.file.url
              };
            }
          }
        })
        .filter(Boolean) as ChatCompletionContentPart[];

      results.push({
        dataId,
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: simpleUserContentPart(value)
      });
    } else if (item.obj === ChatRoleEnum.System) {
      const content = item.value?.[0]?.text?.content;
      if (content) {
        results.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.System,
          content
        });
      }
    } else {
      const aiResults: ChatCompletionMessageParam[] = [];

      //AI
      item.value.forEach((value, i) => {
        if (value.type === ChatItemValueTypeEnum.tool && value.tools && reserveTool) {
          const tool_calls: ChatCompletionMessageToolCall[] = [];
          const toolResponse: ChatCompletionToolMessageParam[] = [];
          value.tools.forEach((tool) => {
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
              name: tool.functionName,
              content: tool.response
            });
          });
          aiResults.push({
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.Assistant,
            tool_calls
          });
          aiResults.push(...toolResponse);
        } else if (
          value.type === ChatItemValueTypeEnum.text &&
          typeof value.text?.content === 'string'
        ) {
          if (!value.text.content && item.value.length > 1) {
            return;
          }
          // Concat text
          const lastValue = item.value[i - 1];
          const lastResult = aiResults[aiResults.length - 1];
          if (
            lastValue &&
            lastValue.type === ChatItemValueTypeEnum.text &&
            typeof lastResult?.content === 'string'
          ) {
            lastResult.content += value.text.content;
          } else {
            aiResults.push({
              dataId,
              role: ChatCompletionRequestMessageRoleEnum.Assistant,
              content: value.text.content
            });
          }
        } else if (value.type === ChatItemValueTypeEnum.interactive) {
          aiResults.push({
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.Assistant,
            interactive: value.interactive
          });
        }
      });

      // Auto add empty assistant message
      results = results.concat(
        aiResults.length > 0
          ? aiResults
          : [
              {
                dataId,
                role: ChatCompletionRequestMessageRoleEnum.Assistant,
                content: ''
              }
            ]
      );
    }
  });

  return results;
};
export const GPTMessages2Chats = (
  messages: ChatCompletionMessageParam[],
  reserveTool = true
): ChatItemType[] => {
  const chatMessages = messages
    .map((item) => {
      const value: ChatItemType['value'] = [];
      const obj = GPT2Chat[item.role];

      if (
        obj === ChatRoleEnum.System &&
        item.role === ChatCompletionRequestMessageRoleEnum.System
      ) {
        if (Array.isArray(item.content)) {
          item.content.forEach((item) => [
            value.push({
              type: ChatItemValueTypeEnum.text,
              text: {
                content: item.text
              }
            })
          ]);
        } else {
          value.push({
            type: ChatItemValueTypeEnum.text,
            text: {
              content: item.content
            }
          });
        }
      } else if (
        obj === ChatRoleEnum.Human &&
        item.role === ChatCompletionRequestMessageRoleEnum.User
      ) {
        if (typeof item.content === 'string') {
          value.push({
            type: ChatItemValueTypeEnum.text,
            text: {
              content: item.content
            }
          });
        } else if (Array.isArray(item.content)) {
          item.content.forEach((item) => {
            if (item.type === 'text') {
              value.push({
                type: ChatItemValueTypeEnum.text,
                text: {
                  content: item.text
                }
              });
            } else if (item.type === 'image_url') {
              value.push({
                //@ts-ignore
                type: ChatItemValueTypeEnum.file,
                file: {
                  type: ChatFileTypeEnum.image,
                  name: '',
                  url: item.image_url.url
                }
              });
            } else if (item.type === 'file_url') {
              value.push({
                // @ts-ignore
                type: ChatItemValueTypeEnum.file,
                file: {
                  type: ChatFileTypeEnum.file,
                  name: item.name,
                  url: item.url
                }
              });
            }
          });
        }
      } else if (
        obj === ChatRoleEnum.AI &&
        item.role === ChatCompletionRequestMessageRoleEnum.Assistant
      ) {
        if (item.tool_calls && reserveTool) {
          // save tool calls
          const toolCalls = item.tool_calls as ChatCompletionMessageToolCall[];
          value.push({
            //@ts-ignore
            type: ChatItemValueTypeEnum.tool,
            tools: toolCalls.map((tool) => {
              let toolResponse =
                messages.find(
                  (msg) =>
                    msg.role === ChatCompletionRequestMessageRoleEnum.Tool &&
                    msg.tool_call_id === tool.id
                )?.content || '';
              toolResponse =
                typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse);

              return {
                id: tool.id,
                toolName: tool.toolName || '',
                toolAvatar: tool.toolAvatar || '',
                functionName: tool.function.name,
                params: tool.function.arguments,
                response: toolResponse as string
              };
            })
          });
        } else if (item.function_call && reserveTool) {
          const functionCall = item.function_call as ChatCompletionMessageFunctionCall;
          const functionResponse = messages.find(
            (msg) =>
              msg.role === ChatCompletionRequestMessageRoleEnum.Function &&
              msg.name === item.function_call?.name
          ) as ChatCompletionFunctionMessageParam;

          if (functionResponse) {
            value.push({
              //@ts-ignore
              type: ChatItemValueTypeEnum.tool,
              tools: [
                {
                  id: functionCall.id || '',
                  toolName: functionCall.toolName || '',
                  toolAvatar: functionCall.toolAvatar || '',
                  functionName: functionCall.name,
                  params: functionCall.arguments,
                  response: functionResponse.content || ''
                }
              ]
            });
          }
        } else if (item.interactive) {
          value.push({
            //@ts-ignore
            type: ChatItemValueTypeEnum.interactive,
            interactive: item.interactive
          });
        } else if (typeof item.content === 'string') {
          const lastValue = value[value.length - 1];
          if (lastValue && lastValue.type === ChatItemValueTypeEnum.text && lastValue.text) {
            lastValue.text.content += item.content;
          } else {
            value.push({
              type: ChatItemValueTypeEnum.text,
              text: {
                content: item.content
              }
            });
          }
        }
      }

      return {
        dataId: item.dataId,
        obj,
        value
      } as ChatItemType;
    })
    .filter((item) => item.value.length > 0);

  // Merge data with the same dataId（Sequential obj merging）
  const result = chatMessages.reduce((result: ChatItemType[], currentItem) => {
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
    if (item.type === 'file' && item.file) {
      prompt.files?.push(item.file);
    } else if (item.text) {
      prompt.text += item.text.content;
    }
  });
  return prompt;
};

export const runtimePrompt2ChatsValue = (
  prompt: RuntimeUserPromptType
): UserChatItemType['value'] => {
  const value: UserChatItemType['value'] = [];
  if (prompt.files) {
    prompt.files.forEach((file) => {
      value.push({
        type: ChatItemValueTypeEnum.file,
        file
      });
    });
  }
  if (prompt.text) {
    value.push({
      type: ChatItemValueTypeEnum.text,
      text: {
        content: prompt.text
      }
    });
  }
  return value;
};

export const getSystemPrompt_ChatItemType = (prompt?: string): ChatItemType[] => {
  if (!prompt) return [];
  return [
    {
      obj: ChatRoleEnum.System,
      value: [{ type: ChatItemValueTypeEnum.text, text: { content: prompt } }]
    }
  ];
};
