import { countGptMessagesTokens } from '../../common/string/tiktoken/index';
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionContentPart,
  ChatCompletionContentPartRefusal,
  ChatCompletionContentPartText,
  ChatCompletionMessageParam,
  SdkChatCompletionMessageParam
} from '@fastgpt/global/core/ai/type.d';
import axios from 'axios';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { i18nT } from '../../../web/i18n/utils';
import { addLog } from '../../common/system/log';
import { getImageBase64 } from '../../common/file/image/utils';

export const filterGPTMessageByMaxContext = async ({
  messages = [],
  maxContext
}: {
  messages: ChatCompletionMessageParam[];
  maxContext: number;
}) => {
  if (!Array.isArray(messages)) {
    return [];
  }

  // If the text length is less than half of the maximum token, no calculation is required
  if (messages.length < 4) {
    return messages;
  }

  // filter startWith system prompt
  const chatStartIndex = messages.findIndex(
    (item) => item.role !== ChatCompletionRequestMessageRoleEnum.System
  );
  const systemPrompts: ChatCompletionMessageParam[] = messages.slice(0, chatStartIndex);
  const chatPrompts: ChatCompletionMessageParam[] = messages.slice(chatStartIndex);

  if (chatPrompts.length === 0) {
    return systemPrompts;
  }

  // reduce token of systemPrompt
  maxContext -= await countGptMessagesTokens(systemPrompts);

  /* 截取时候保证一轮内容的完整性
    1. user - assistant - user
    2. user - assistant - tool
    3. user - assistant - tool - tool - tool
    3. user - assistant - tool - assistant - tool
    4. user - assistant - assistant - tool - tool
  */
  // Save the last chat prompt(question)
  let chats: ChatCompletionMessageParam[] = [];
  let tmpChats: ChatCompletionMessageParam[] = [];

  // 从后往前截取对话内容, 每次到 user 则认为是一组完整信息
  while (chatPrompts.length > 0) {
    const lastMessage = chatPrompts.pop();
    if (!lastMessage) {
      break;
    }

    // 遇到 user，说明到了一轮完整信息，可以开始判断是否需要保留
    if (lastMessage.role === ChatCompletionRequestMessageRoleEnum.User) {
      const tokens = await countGptMessagesTokens([lastMessage, ...tmpChats]);
      maxContext -= tokens;
      // 该轮信息整体 tokens 超出范围，这段数据不要了。但是至少保证一组。
      if (maxContext < 0 && chats.length > 0) {
        break;
      }

      chats = [lastMessage, ...tmpChats].concat(chats);
      tmpChats = [];
    } else {
      tmpChats.unshift(lastMessage);
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
  const parseSystemMessage = (
    content: string | ChatCompletionContentPartText[]
  ): string | ChatCompletionContentPartText[] | undefined => {
    if (typeof content === 'string') {
      if (!content) return;
      return content;
    }

    const arrayContent = content
      .filter((item) => item.text)
      .map((item) => item.text)
      .join('\n');

    return arrayContent;
  };
  // Parse user content(text and img) Store history => api messages
  const parseUserContent = async (content: string | ChatCompletionContentPart[]) => {
    // Split question text and image
    const parseStringWithImages = (input: string): ChatCompletionContentPart[] => {
      if (!useVision || input.length > 500) {
        return [{ type: 'text', text: input }];
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
        return [{ type: 'text', text: input }];
      }

      // 添加原始input作为文本
      result.push({ type: 'text', text: input });
      return result;
    };
    // Load image to base64
    const loadUserContentImage = async (content: ChatCompletionContentPart[]) => {
      return Promise.all(
        content.map(async (item) => {
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
              if (imgUrl.startsWith('/') || process.env.MULTIPLE_DATA_TO_BASE64 === 'true') {
                const { completeBase64: base64 } = await getImageBase64(imgUrl);

                return {
                  ...item,
                  image_url: {
                    ...item.image_url,
                    url: base64
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
            } catch (error: any) {
              if (error?.response?.status === 405) {
                return item;
              }
              addLog.warn(`Filter invalid image: ${imgUrl}`, { error });
              return;
            }
          }
          return item;
        })
      ).then((res) => res.filter(Boolean) as ChatCompletionContentPart[]);
    };

    if (content === undefined) return;
    if (typeof content === 'string') {
      if (content === '') return;

      const loadImageContent = await loadUserContentImage(parseStringWithImages(content));
      if (loadImageContent.length === 0) return;
      return loadImageContent;
    }

    const result = (
      await Promise.all(
        content.map(async (item) => {
          if (item.type === 'text') {
            // If it is array, not need to parse image
            if (item.text) return item;
            return;
          }
          if (item.type === 'file_url') return; // LLM not support file_url
          if (item.type === 'image_url') {
            // close vision, remove image_url
            if (!useVision) return;
            // remove empty image_url
            if (!item.image_url.url) return;
          }

          return item;
        })
      )
    )
      .flat()
      .filter(Boolean) as ChatCompletionContentPart[];

    const loadImageContent = await loadUserContentImage(result);

    if (loadImageContent.length === 0) return;
    return loadImageContent;
  };

  const formatAssistantItem = (item: ChatCompletionAssistantMessageParam) => {
    return {
      role: item.role,
      content: item.content,
      function_call: item.function_call,
      name: item.name,
      refusal: item.refusal,
      tool_calls: item.tool_calls
    };
  };
  const parseAssistantContent = (
    content:
      | string
      | (ChatCompletionContentPartText | ChatCompletionContentPartRefusal)[]
      | null
      | undefined
  ) => {
    if (typeof content === 'string') {
      return content || '';
    }
    // 交互节点
    if (!content) return '';

    const result = content.filter((item) => item?.type === 'text');
    if (result.length === 0) return '';

    return result.map((item) => item.text).join('\n');
  };

  if (messages.length === 0) {
    return Promise.reject(i18nT('common:core.chat.error.Messages empty'));
  }

  // 合并相邻 role 的内容，只保留一个 role， content 变成数组。 assistant 的话，工具调用不合并。
  const mergeMessages = ((messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] => {
    return messages.reduce((mergedMessages: ChatCompletionMessageParam[], currentMessage) => {
      const lastMessage = mergedMessages[mergedMessages.length - 1];

      if (!lastMessage) {
        return [currentMessage];
      }

      if (
        lastMessage.role === ChatCompletionRequestMessageRoleEnum.System &&
        currentMessage.role === ChatCompletionRequestMessageRoleEnum.System
      ) {
        const lastContent: ChatCompletionContentPartText[] = Array.isArray(lastMessage.content)
          ? lastMessage.content
          : [{ type: 'text', text: lastMessage.content || '' }];
        const currentContent: ChatCompletionContentPartText[] = Array.isArray(
          currentMessage.content
        )
          ? currentMessage.content
          : [{ type: 'text', text: currentMessage.content || '' }];
        lastMessage.content = [...lastContent, ...currentContent];
      } // Handle user messages
      else if (
        lastMessage.role === ChatCompletionRequestMessageRoleEnum.User &&
        currentMessage.role === ChatCompletionRequestMessageRoleEnum.User
      ) {
        const lastContent: ChatCompletionContentPart[] = Array.isArray(lastMessage.content)
          ? lastMessage.content
          : [{ type: 'text', text: lastMessage.content }];
        const currentContent: ChatCompletionContentPart[] = Array.isArray(currentMessage.content)
          ? currentMessage.content
          : [{ type: 'text', text: currentMessage.content }];
        lastMessage.content = [...lastContent, ...currentContent];
      } else if (
        lastMessage.role === ChatCompletionRequestMessageRoleEnum.Assistant &&
        currentMessage.role === ChatCompletionRequestMessageRoleEnum.Assistant
      ) {
        // Content 不为空的对象，或者是交互节点
        if (
          (typeof lastMessage.content === 'string' ||
            Array.isArray(lastMessage.content) ||
            lastMessage.interactive) &&
          (typeof currentMessage.content === 'string' ||
            Array.isArray(currentMessage.content) ||
            currentMessage.interactive)
        ) {
          const lastContent: (ChatCompletionContentPartText | ChatCompletionContentPartRefusal)[] =
            Array.isArray(lastMessage.content)
              ? lastMessage.content
              : [{ type: 'text', text: lastMessage.content || '' }];
          const currentContent: (
            | ChatCompletionContentPartText
            | ChatCompletionContentPartRefusal
          )[] = Array.isArray(currentMessage.content)
            ? currentMessage.content
            : [{ type: 'text', text: currentMessage.content || '' }];

          lastMessage.content = [...lastContent, ...currentContent];
        } else {
          // 有其中一个没有 content，说明不是连续的文本输出
          mergedMessages.push(currentMessage);
        }
      } else {
        mergedMessages.push(currentMessage);
      }

      return mergedMessages;
    }, []);
  })(messages);

  const loadMessages = (
    await Promise.all(
      mergeMessages.map(async (item, i) => {
        if (item.role === ChatCompletionRequestMessageRoleEnum.System) {
          const content = parseSystemMessage(item.content);
          if (!content) return;
          return {
            ...item,
            content
          };
        } else if (item.role === ChatCompletionRequestMessageRoleEnum.User) {
          const content = await parseUserContent(item.content);
          if (!content) {
            return {
              ...item,
              content: 'null'
            };
          }

          const formatContent = (() => {
            if (Array.isArray(content) && content.length === 1 && content[0].type === 'text') {
              return content[0].text;
            }
            return content;
          })();

          return {
            ...item,
            content: formatContent
          };
        } else if (item.role === ChatCompletionRequestMessageRoleEnum.Assistant) {
          if (item.tool_calls || item.function_call) {
            return formatAssistantItem(item);
          }

          const parseContent = parseAssistantContent(item.content);

          // 如果内容为空，且前后不再是 assistant，需要补充成 null，避免丢失 user-assistant 的交互
          const formatContent = (() => {
            const lastItem = mergeMessages[i - 1];
            const nextItem = mergeMessages[i + 1];
            if (
              parseContent === '' &&
              (lastItem?.role === ChatCompletionRequestMessageRoleEnum.Assistant ||
                nextItem?.role === ChatCompletionRequestMessageRoleEnum.Assistant)
            ) {
              return;
            }
            return parseContent || 'null';
          })();
          if (!formatContent) return;

          return {
            ...formatAssistantItem(item),
            content: formatContent
          };
        } else {
          return item;
        }
      })
    )
  ).filter(Boolean) as ChatCompletionMessageParam[];

  return loadMessages as SdkChatCompletionMessageParam[];
};
