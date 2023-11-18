import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatRoleEnum, IMG_BLOCK_KEY } from '@fastgpt/global/core/chat/constants';
import { countMessagesTokens, countPromptTokens } from '@fastgpt/global/common/string/tiktoken';
import { adaptRole_Chat2Message } from '@fastgpt/global/core/chat/adapt';
import type { ChatCompletionContentPart } from '@fastgpt/global/core/ai/type.d';

/* slice chat context by tokens */
export function ChatContextFilter({
  messages = [],
  maxTokens
}: {
  messages: ChatItemType[];
  maxTokens: number;
}) {
  if (!Array.isArray(messages)) {
    return [];
  }
  const rawTextLen = messages.reduce((sum, item) => sum + item.value.length, 0);

  // If the text length is less than half of the maximum token, no calculation is required
  if (rawTextLen < maxTokens * 0.5) {
    return messages;
  }

  // filter startWith system prompt
  const chatStartIndex = messages.findIndex((item) => item.obj !== ChatRoleEnum.System);
  const systemPrompts: ChatItemType[] = messages.slice(0, chatStartIndex);
  const chatPrompts: ChatItemType[] = messages.slice(chatStartIndex);

  // reduce token of systemPrompt
  maxTokens -= countMessagesTokens({
    messages: systemPrompts
  });

  // 根据 tokens 截断内容
  const chats: ChatItemType[] = [];

  // 从后往前截取对话内容
  for (let i = chatPrompts.length - 1; i >= 0; i--) {
    const item = chatPrompts[i];
    chats.unshift(item);

    const tokens = countPromptTokens(item.value, adaptRole_Chat2Message(item.obj));
    maxTokens -= tokens;

    /* 整体 tokens 超出范围, system必须保留 */
    if (maxTokens <= 0) {
      chats.shift();
      break;
    }
  }

  return [...systemPrompts, ...chats];
}

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
export function formatStr2ChatContent(str: string) {
  const content: ChatCompletionContentPart[] = [];
  let lastIndex = 0;
  const regex = new RegExp(`\`\`\`(${IMG_BLOCK_KEY})\\n([\\s\\S]*?)\`\`\``, 'g');

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
          type: 'image_url' as any,
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
  return content ? content : null;
}
