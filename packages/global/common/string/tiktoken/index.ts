/* Only the token of gpt-3.5-turbo is used */
import type { ChatItemType } from '../../../core/chat/type';
import { Tiktoken } from 'js-tiktoken/lite';
import { adaptChat2GptMessages } from '../../../core/chat/adapt';
import { ChatCompletionRequestMessageRoleEnum } from '../../../core/ai/constant';
import encodingJson from './cl100k_base.json';
import { ChatMessageItemType } from '../../../core/ai/type';

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
  role: '' | `${ChatCompletionRequestMessageRoleEnum}` = '',
  tools?: any
) {
  const enc = getTikTokenEnc();
  const toolText = tools
    ? JSON.stringify(tools)
        .replace('"', '')
        .replace('\n', '')
        .replace(/( ){2,}/g, ' ')
    : '';
  const text = `${role}\n${prompt}\n${toolText}`.trim();

  try {
    const encodeText = enc.encode(text);
    const supplementaryToken = role ? 4 : 0;
    return encodeText.length + supplementaryToken;
  } catch (error) {
    return text.length;
  }
}

/* count messages tokens */
export const countMessagesTokens = (messages: ChatItemType[], tools?: any) => {
  const adaptMessages = adaptChat2GptMessages({ messages, reserveId: true });

  return countGptMessagesTokens(adaptMessages, tools);
};
export const countGptMessagesTokens = (messages: ChatMessageItemType[], tools?: any) =>
  messages.reduce((sum, item) => sum + countPromptTokens(item.content, item.role, tools), 0);

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
