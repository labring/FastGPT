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
import { i18nT } from '../../../web/i18n/utils';
import { addLog } from '../../common/system/log';

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
    return messages;
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

  return [...systemPrompts, ...chats];
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
  // Load image to base64
  const loadImageToBase64 = async (messages: ChatCompletionContentPart[]) => {
    if (process.env.MULTIPLE_DATA_TO_BASE64 === 'false') {
      return messages;
    }
    return Promise.all(
      messages.map(async (item) => {
        if (item.type === 'image_url') {
          // Remove url origin
          const imgUrl = (() => {
            if (origin && item.image_url.url.startsWith(origin)) {
              return item.image_url.url.replace(origin, '');
            }
            return item.image_url.url;
          })();

          // base64 image
          if (imgUrl.startsWith('data:image/')) {
            return item;
          }

          try {
            // If imgUrl is a local path, load image from local, and set url to base64
            if (imgUrl.startsWith('/')) {
              addLog.debug('Load image from local server', {
                baseUrl: serverRequestBaseUrl,
                requestUrl: imgUrl
              });
              const response = await axios.get(imgUrl, {
                baseURL: serverRequestBaseUrl,
                responseType: 'arraybuffer',
                proxy: false
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

            // 检查下这个图片是否可以被访问，如果不行的话，则过滤掉
            const response = await axios.head(imgUrl, {
              timeout: 10000
            });
            if (response.status < 200 || response.status >= 400) {
              addLog.info(`Filter invalid image: ${imgUrl}`);
              return;
            }
          } catch (error) {
            return;
          }
        }
        return item;
      })
    ).then((res) => res.filter(Boolean) as ChatCompletionContentPart[]);
  };
  // Split question text and image
  const parseStringWithImages = (input: string): ChatCompletionContentPart[] => {
    if (!useVision || input.length > 500) {
      return [{ type: 'text', text: input || '' }];
    }

    // 正则表达式匹配图片URL
    const imageRegex =
      /(https?:\/\/[^\s/$.?#].[^\s]*\.(?:png|jpe?g|gif|webp|bmp|tiff?|svg|ico|heic|avif))/gi;

    const result: ChatCompletionContentPart[] = [];

    // 提取所有HTTPS图片URL并添加到result开头
    const httpsImages = [...new Set(Array.from(input.matchAll(imageRegex), (m) => m[0]))];
    httpsImages.forEach((url) => {
      result.push({
        type: 'image_url',
        image_url: {
          url: url
        }
      });
    });

    // Too many images return text
    if (httpsImages.length > 4) {
      return [{ type: 'text', text: input || '' }];
    }

    // 添加原始input作为文本
    result.push({ type: 'text', text: input });
    return result;
  };
  // Parse user content(text and img) Store history => api messages
  const parseUserContent = async (content: string | ChatCompletionContentPart[]) => {
    if (typeof content === 'string') {
      return loadImageToBase64(parseStringWithImages(content));
    }

    const result = await Promise.all(
      content.map(async (item) => {
        if (item.type === 'text') return parseStringWithImages(item.text);
        if (item.type === 'file_url') return; // LLM not support file_url

        if (!item.image_url.url) return item;

        return item;
      })
    );

    return loadImageToBase64(result.flat().filter(Boolean) as ChatCompletionContentPart[]);
  };

  // format GPT messages, concat text messages
  const clearInvalidMessages = (messages: ChatCompletionMessageParam[]) => {
    return messages
      .map((item) => {
        if (item.role === ChatCompletionRequestMessageRoleEnum.System && !item.content) {
          return;
        }
        if (item.role === ChatCompletionRequestMessageRoleEnum.User) {
          if (item.content === undefined) return;

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
          if (item.content === undefined && !item.tool_calls && !item.function_call) return;
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
    return Promise.reject(i18nT('common:core.chat.error.Messages empty'));
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
        // remove invalid field
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
