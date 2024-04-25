import { IMG_BLOCK_KEY } from '@fastgpt/global/core/chat/constants';
import { countGptMessagesTokens } from '../../common/string/tiktoken/index';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam
} from '@fastgpt/global/core/ai/type.d';
import axios from 'axios';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { guessBase64ImageType } from '../../common/file/utils';

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

/**
    string to vision model. Follow the markdown code block rule for interception:

    @rule:
    ```img-block
        {src:""}
        {src:""}
    ```
    ```file-block
        {name:"",src:""},
        {name:"",src:""}
    ```
    @example:
        What’s in this image?
        ```img-block
            {src:"https://1.png"}
        ```
    @return 
        [
            { type: 'text', text: 'What’s in this image?' },
            {
              type: 'image_url',
              image_url: {
                url: 'https://1.png'
              }
            }
        ]
 */
export async function formatStr2ChatContent(str: string) {
  const content: ChatCompletionContentPart[] = [];
  let lastIndex = 0;
  const regex = new RegExp(`\`\`\`(${IMG_BLOCK_KEY})\\n([\\s\\S]*?)\`\`\``, 'g');

  const imgKey: 'image_url' = 'image_url';

  let match;

  while ((match = regex.exec(str)) !== null) {
    // add previous text
    if (match.index > lastIndex) {
      const text = str.substring(lastIndex, match.index).trim();
      if (text) {
        content.push({ type: 'text', text });
      }
    }

    const blockType = match[1].trim();

    if (blockType === IMG_BLOCK_KEY) {
      const blockContentLines = match[2].trim().split('\n');
      const jsonLines = blockContentLines.map((item) => {
        try {
          return JSON.parse(item) as { src: string };
        } catch (error) {
          return { src: '' };
        }
      });

      for (const item of jsonLines) {
        if (!item.src) throw new Error("image block's content error");
      }

      content.push(
        ...jsonLines.map((item) => ({
          type: imgKey,
          image_url: {
            url: item.src
          }
        }))
      );
    }

    lastIndex = regex.lastIndex;
  }

  // add remaining text
  if (lastIndex < str.length) {
    const remainingText = str.substring(lastIndex).trim();
    if (remainingText) {
      content.push({ type: 'text', text: remainingText });
    }
  }

  // Continuous text type content, if type=text, merge them
  for (let i = 0; i < content.length - 1; i++) {
    const currentContent = content[i];
    const nextContent = content[i + 1];
    if (currentContent.type === 'text' && nextContent.type === 'text') {
      currentContent.text += nextContent.text;
      content.splice(i + 1, 1);
      i--;
    }
  }

  if (content.length === 1 && content[0].type === 'text') {
    return content[0].text;
  }

  if (!content) return null;
  // load img to base64
  for await (const item of content) {
    if (item.type === imgKey && item[imgKey]?.url) {
      const response = await axios.get(item[imgKey].url, {
        responseType: 'arraybuffer'
      });
      const base64 = Buffer.from(response.data).toString('base64');
      item[imgKey].url = `data:${response.headers['content-type']};base64,${base64}`;
    }
  }

  return content ? content : null;
}

export const loadChatImgToBase64 = async (content: string | ChatCompletionContentPart[]) => {
  if (typeof content === 'string') {
    return content;
  }
  return Promise.all(
    content.map(async (item) => {
      if (item.type === 'text') return item;
      // load image
      const response = await axios.get(item.image_url.url, {
        responseType: 'arraybuffer'
      });
      const base64 = Buffer.from(response.data).toString('base64');
      let imageType = response.headers['content-type'];
      if (imageType === undefined) {
        imageType = guessBase64ImageType(base64);
      }
      item.image_url.url = `data:${imageType};base64,${base64}`;
      return item;
    })
  );
};
