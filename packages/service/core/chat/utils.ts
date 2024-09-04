import { countGptMessagesTokens } from '../../common/string/tiktoken/index';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  SdkChatCompletionMessageParam
} from '@fastgpt/global/core/ai/type.d';
import axios from 'axios';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { getFileContentTypeFromHeader, guessBase64ImageType } from '../../common/file/utils';
import { serverRequestBaseUrl } from '../../common/api/serverRequest';

/* slice chat context by tokens */
const filterEmptyMessages = (messages: ChatCompletionMessageParam[]) => {
  return messages.filter((item) => {
    if (item.role === ChatCompletionRequestMessageRoleEnum.System) return !!item.content;
    if (item.role === ChatCompletionRequestMessageRoleEnum.User) return !!item.content;
    if (item.role === ChatCompletionRequestMessageRoleEnum.Assistant)
      return !!item.content || !!item.function_call || !!item.tool_calls;
    return true;
  });
};

export const filterGPTMessageByMaxTokens = async ({
  messages = [],
  maxTokens
}: {
  messages: ChatCompletionMessageParam[];
  maxTokens: number;
}) => {
  if (!Array.isArray(messages)) {
    return [];
  }
  const rawTextLen = messages.reduce((sum, item) => {
    if (typeof item.content === 'string') {
      return sum + item.content.length;
    }
    if (Array.isArray(item.content)) {
      return (
        sum +
        item.content.reduce((sum, item) => {
          if (item.type === 'text') {
            return sum + item.text.length;
          }
          return sum;
        }, 0)
      );
    }
    return sum;
  }, 0);

  // If the text length is less than half of the maximum token, no calculation is required
  if (rawTextLen < maxTokens * 0.5) {
    return filterEmptyMessages(messages);
  }

  // filter startWith system prompt
  const chatStartIndex = messages.findIndex(
    (item) => item.role !== ChatCompletionRequestMessageRoleEnum.System
  );
  const systemPrompts: ChatCompletionMessageParam[] = messages.slice(0, chatStartIndex);
  const chatPrompts: ChatCompletionMessageParam[] = messages.slice(chatStartIndex);

  // reduce token of systemPrompt
  maxTokens -= await countGptMessagesTokens(systemPrompts);

  // Save the last chat prompt(question)
  const question = chatPrompts.pop();
  if (!question) {
    return systemPrompts;
  }
  const chats: ChatCompletionMessageParam[] = [question];

  // 从后往前截取对话内容, 每次需要截取2个
  while (1) {
    const assistant = chatPrompts.pop();
    const user = chatPrompts.pop();
    if (!assistant || !user) {
      break;
    }

    const tokens = await countGptMessagesTokens([assistant, user]);
    maxTokens -= tokens;
    /* 整体 tokens 超出范围，截断  */
    if (maxTokens < 0) {
      break;
    }

    chats.unshift(assistant);
    chats.unshift(user);

    if (chatPrompts.length === 0) {
      break;
    }
  }

  return filterEmptyMessages([...systemPrompts, ...chats]);
};

/* 
  Format requested messages
  1. If not useVision, only retain text.
  2. Remove file_url
  3. If useVision, parse url from question, and load image from url(Local url)
*/
export const loadRequestMessages = async ({
  messages,
  useVision = true,
  origin
}: {
  messages: ChatCompletionMessageParam[];
  useVision?: boolean;
  origin?: string;
}) => {
  // Split question text and image
  function parseStringWithImages(input: string): ChatCompletionContentPart[] {
    if (!useVision) {
      return [{ type: 'text', text: input || '' }];
    }

    // 正则表达式匹配图片URL
    const imageRegex =
      /(https?:\/\/[^\s/$.?#].[^\s]*\.(?:png|jpe?g|gif|webp|bmp|tiff?|svg|ico|heic|avif))/i;

    const result: ChatCompletionContentPart[] = [];

    // 提取所有HTTPS图片URL并添加到result开头
    const httpsImages = input.match(imageRegex) || [];
    httpsImages.forEach((url) => {
      result.push({
        type: 'image_url',
        image_url: {
          url: url
        }
      });
    });

    // 添加原始input作为文本
    result.push({ type: 'text', text: input });
    return result;
  }
  // Load image
  const parseUserContent = async (content: string | ChatCompletionContentPart[]) => {
    if (typeof content === 'string') {
      return parseStringWithImages(content);
    }

    const result = await Promise.all(
      content.map(async (item) => {
        if (item.type === 'text') return parseStringWithImages(item.text);
        if (item.type === 'file_url') return;

        if (!item.image_url.url) return item;

        // Remove url origin
        const imgUrl = (() => {
          if (origin && item.image_url.url.startsWith(origin)) {
            return item.image_url.url.replace(origin, '');
          }
          return item.image_url.url;
        })();

        /* Load local image */
        if (imgUrl.startsWith('/')) {
          const response = await axios.get(imgUrl, {
            baseURL: serverRequestBaseUrl,
            responseType: 'arraybuffer'
          });
          const base64 = Buffer.from(response.data, 'binary').toString('base64');
          const imageType =
            getFileContentTypeFromHeader(response.headers['content-type']) ||
            guessBase64ImageType(base64);

          return {
            ...item,
            image_url: {
              ...item.image_url,
              url: `data:${imageType};base64,${base64}`
            }
          };
        }

        return item;
      })
    );

    return result.flat().filter(Boolean);
  };
  // format GPT messages, concat text messages
  const clearInvalidMessages = (messages: ChatCompletionMessageParam[]) => {
    return messages
      .map((item) => {
        if (item.role === ChatCompletionRequestMessageRoleEnum.System && !item.content) {
          return;
        }
        if (item.role === ChatCompletionRequestMessageRoleEnum.User) {
          if (!item.content) return;

          if (typeof item.content === 'string') {
            return {
              ...item,
              content: item.content.trim()
            };
          }

          // array
          if (item.content.length === 0) return;
          if (item.content.length === 1 && item.content[0].type === 'text') {
            return {
              ...item,
              content: item.content[0].text
            };
          }
        }
        if (item.role === ChatCompletionRequestMessageRoleEnum.Assistant) {
          if (item.content !== undefined && !item.content) return;
          if (Array.isArray(item.content) && item.content.length === 0) return;
        }

        return item;
      })
      .filter(Boolean) as ChatCompletionMessageParam[];
  };
  /* 
    Merge data for some consecutive roles
    1. Contiguous assistant and both have content, merge content
  */
  const mergeConsecutiveMessages = (
    messages: ChatCompletionMessageParam[]
  ): ChatCompletionMessageParam[] => {
    return messages.reduce((mergedMessages: ChatCompletionMessageParam[], currentMessage) => {
      const lastMessage = mergedMessages[mergedMessages.length - 1];

      if (
        lastMessage &&
        currentMessage.role === ChatCompletionRequestMessageRoleEnum.Assistant &&
        lastMessage.role === ChatCompletionRequestMessageRoleEnum.Assistant &&
        typeof lastMessage.content === 'string' &&
        typeof currentMessage.content === 'string'
      ) {
        lastMessage.content += currentMessage ? `\n${currentMessage.content}` : '';
      } else {
        mergedMessages.push(currentMessage);
      }

      return mergedMessages;
    }, []);
  };

  if (messages.length === 0) {
    return Promise.reject('core.chat.error.Messages empty');
  }

  // filter messages file
  const filterMessages = messages.map((item) => {
    // If useVision=false, only retain text.
    if (
      item.role === ChatCompletionRequestMessageRoleEnum.User &&
      Array.isArray(item.content) &&
      !useVision
    ) {
      return {
        ...item,
        content: item.content.filter((item) => item.type === 'text')
      };
    }

    return item;
  });

  const loadMessages = (await Promise.all(
    filterMessages.map(async (item) => {
      if (item.role === ChatCompletionRequestMessageRoleEnum.User) {
        return {
          ...item,
          content: await parseUserContent(item.content)
        };
      } else if (item.role === ChatCompletionRequestMessageRoleEnum.Assistant) {
        return {
          role: item.role,
          content: item.content,
          function_call: item.function_call,
          name: item.name,
          refusal: item.refusal,
          tool_calls: item.tool_calls
        };
      } else {
        return item;
      }
    })
  )) as ChatCompletionMessageParam[];

  return mergeConsecutiveMessages(
    clearInvalidMessages(loadMessages)
  ) as SdkChatCompletionMessageParam[];
};
