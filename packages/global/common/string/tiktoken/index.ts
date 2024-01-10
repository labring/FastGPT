/* Only the token of gpt-3.5-turbo is used */
import type { ChatItemType } from '../../../core/chat/type';
import { Tiktoken } from 'js-tiktoken/lite';
import { adaptChat2GptMessages } from '../../../core/chat/adapt';
import { ChatCompletionRequestMessageRoleEnum } from '../../../core/ai/constant';
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
export function countPromptTokens(
  prompt = '',
  role: '' | `${ChatCompletionRequestMessageRoleEnum}` = ''
) {
  const enc = getTikTokenEnc();
  const text = `${role}\n${prompt}`;

  // too large a text will block the thread
  if (text.length > 15000) {
    return text.length * 1.7;
  }

  try {
    const encodeText = enc.encode(text);
    return encodeText.length + role.length; // 补充 role 估算值
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
