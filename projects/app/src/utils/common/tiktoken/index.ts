/* Only the token of gpt-3.5-turbo is used */
import { ChatItemType } from '@/types/chat';
import { Tiktoken } from 'js-tiktoken/lite';
import { adaptChat2GptMessages } from '../adapt/message';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/core/aiApi/constant';
import encodingJson from './cl100k_base.json';

/* init tikToken obj */
export function getTikTokenEnc() {
  if (typeof window !== 'undefined' && window.TikToken) {
    return window.TikToken;
  }
  if (typeof global !== 'undefined' && global.TikToken) {
    return global.TikToken;
  }

  const enc = new Tiktoken(encodingJson);

  if (typeof window !== 'undefined') {
    window.TikToken = enc;
  }
  if (typeof global !== 'undefined') {
    global.TikToken = enc;
  }

  return enc;
}

/* count one prompt tokens */
export function countPromptTokens(prompt = '', role: `${ChatCompletionRequestMessageRoleEnum}`) {
  const enc = getTikTokenEnc();
  const text = `${role}\n${prompt}`;
  try {
    const encodeText = enc.encode(text);
    return encodeText.length + 3; // 补充 role 估算值
  } catch (error) {
    return text.length;
  }
}

/* count messages tokens */
export function countMessagesTokens({ messages }: { messages: ChatItemType[] }) {
  const adaptMessages = adaptChat2GptMessages({ messages, reserveId: true });

  let totalTokens = 0;
  for (let i = 0; i < adaptMessages.length; i++) {
    const item = adaptMessages[i];
    const tokens = countPromptTokens(item.content, item.role);
    totalTokens += tokens;
  }

  return totalTokens;
}

export function sliceTextByTokens({ text, length }: { text: string; length: number }) {
  const enc = getTikTokenEnc();

  try {
    const encodeText = enc.encode(text);
    return enc.decode(encodeText.slice(0, length));
  } catch (error) {
    return text.slice(0, length);
  }
}

/* slice messages from top to bottom by maxTokens */
export function sliceMessagesTB({
  messages,
  maxTokens
}: {
  messages: ChatItemType[];
  maxTokens: number;
}) {
  const adaptMessages = adaptChat2GptMessages({ messages, reserveId: true });
  let reduceTokens = maxTokens;
  let result: ChatItemType[] = [];

  for (let i = 0; i < adaptMessages.length; i++) {
    const item = adaptMessages[i];

    const tokens = countPromptTokens(item.content, item.role);
    reduceTokens -= tokens;

    if (reduceTokens > 0) {
      result.push(messages[i]);
    } else {
      break;
    }
  }

  return result.length === 0 && messages[0] ? [messages[0]] : result;
}
