import type { ChatItemType, RuntimeUserPromptType } from '../../core/chat/type.d';
import { ChatFileTypeEnum, ChatItemValueTypeEnum, ChatRoleEnum } from '../../core/chat/constants';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam
} from '../../core/ai/type.d';
import { ChatCompletionRequestMessageRoleEnum } from '../../core/ai/constants';

const GPT2Chat = {
  [ChatCompletionRequestMessageRoleEnum.System]: ChatRoleEnum.AI,
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
  reserveId
}: {
  messages: ChatItemType[];
  reserveId: boolean;
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
          if (item.file?.type === ChatFileTypeEnum.image) {
            return {
              type: 'image_url',
              image_url: {
                url: item.file?.url || ''
              }
            };
          }
          return;
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
      item.value.forEach((value) => {
        if (value.tools) {
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
          results = results
            .concat({
              dataId,
              role: ChatCompletionRequestMessageRoleEnum.Assistant,
              tool_calls
            })
            .concat(toolResponse);
        } else if (value.text) {
          results.push({
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.Assistant,
            content: value.text.content
          });
        }
      });
    }
  });

  return results;
};
export const GPTMessages2Chats = (messages: ChatCompletionMessageParam[]): ChatItemType[] => {
  return messages.map((item) => {
    const value: ChatItemType['value'] = [];

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
            type: ChatItemValueTypeEnum.file,
            file: {
              type: ChatFileTypeEnum.image,
              name: '',
              url: item.image_url.url
            }
          });
        }
      });
      // @ts-ignore
    } else if (item.tool_calls) {
      // no content, is tool
      //@ts-ignore
      const toolCalls = item.tool_calls as ChatCompletionMessageToolCall[];
      value.push({
        type: ChatItemValueTypeEnum.tool,
        tools: toolCalls.map((tool) => {
          //@ts-ignore
          let toolResponse = messages.find((msg) => msg.tool_call_id === tool.id)?.content || '';
          toolResponse =
            typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse);

          return {
            id: tool.id,
            toolName: tool.toolName || '',
            avatar: tool.toolAvatar || '',
            functionName: tool.function.name,
            params: tool.function.arguments,
            response: toolResponse as string
          };
        })
      });
    }

    return {
      dataId: item.dataId,
      obj: GPT2Chat[item.role],
      value
    };
  });
};

export const chatValue2RuntimePrompt = (value: ChatItemType['value']): RuntimeUserPromptType => {
  const prompt: RuntimeUserPromptType = {
    files: [],
    text: ''
  };
  value.forEach((item) => {
    if (item.file) {
      prompt.files?.push(item.file);
    } else if (item.text) {
      prompt.text += item.text.content;
    }
  });
  return prompt;
};

export const runtimePrompt2ChatsValue = (prompt: RuntimeUserPromptType): ChatItemType['value'] => {
  const value: ChatItemType['value'] = [];
  if (prompt.files) {
    prompt.files.forEach((file) => {
      value.push({
        type: ChatItemValueTypeEnum.file,
        file: file
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

export const getSystemPrompt = (prompt?: string) => {
  if (!prompt) return [];
  return [
    {
      obj: ChatRoleEnum.System,
      value: [{ type: ChatItemValueTypeEnum.text, text: { content: prompt } }]
    }
  ];
};
