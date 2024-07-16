import { countGptMessagesTokens } from '../../common/string/tiktoken/index';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam
} from '@fastgpt/global/core/ai/type.d';
import axios from 'axios';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { guessBase64ImageType } from '../../common/file/utils';
import { serverRequestBaseUrl } from '../../common/api/serverRequest';
import { cloneDeep } from 'lodash';

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

export const formatGPTMessagesInRequestBefore = (messages: ChatCompletionMessageParam[]) => {
  return messages
    .map((item) => {
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

      return item;
    })
    .filter(Boolean) as ChatCompletionMessageParam[];
};

/* Load user chat content.
  Img: to base 64
*/
export const loadChatImgToBase64 = async (content: string | ChatCompletionContentPart[]) => {
  if (typeof content === 'string') {
    return content;
  }

  return Promise.all(
    content.map(async (item) => {
      if (item.type === 'text') return item;

      if (!item.image_url.url) return item;

      /* 
        1. From db: Get it from db
        2. From web: Not update
      */
      if (item.image_url.url.startsWith('/')) {
        const response = await axios.get(item.image_url.url, {
          baseURL: serverRequestBaseUrl,
          responseType: 'arraybuffer'
        });
        const base64 = Buffer.from(response.data).toString('base64');
        let imageType = response.headers['content-type'];
        if (imageType === undefined) {
          imageType = guessBase64ImageType(base64);
        }
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
};
export const loadRequestMessages = async (messages: ChatCompletionMessageParam[]) => {
  if (messages.length === 0) {
    return Promise.reject('core.chat.error.Messages empty');
  }

  const loadMessages = await Promise.all(
    messages.map(async (item) => {
      if (item.role === ChatCompletionRequestMessageRoleEnum.User) {
        return {
          ...item,
          content: await loadChatImgToBase64(item.content)
        };
      } else {
        return item;
      }
    })
  );

  return loadMessages;
};
