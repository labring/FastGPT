import { encoding_for_model } from '@dqbd/tiktoken';
import type { ChatItemType } from '@/types/chat';
import { ChatRoleEnum } from '@/constants/chat';
import { ChatCompletionRequestMessageRoleEnum } from 'openai';
import axios from 'axios';
import type { MessageItemType } from '@/pages/api/openapi/v1/chat/completions';

export const getOpenAiEncMap = () => {
  if (typeof window !== 'undefined' && window.OpenAiEncMap) {
    return window.OpenAiEncMap;
  }
  if (typeof global !== 'undefined' && global.OpenAiEncMap) {
    return global.OpenAiEncMap;
  }
  const enc = encoding_for_model('gpt-3.5-turbo', {
    '<|im_start|>': 100264,
    '<|im_end|>': 100265,
    '<|im_sep|>': 100266
  });

  if (typeof window !== 'undefined') {
    window.OpenAiEncMap = enc;
  }
  if (typeof global !== 'undefined') {
    global.OpenAiEncMap = enc;
  }

  return enc;
};

export const adaptChatItem_openAI = ({
  messages,
  reserveId
}: {
  messages: ChatItemType[];
  reserveId: boolean;
}): MessageItemType[] => {
  const map = {
    [ChatRoleEnum.AI]: ChatCompletionRequestMessageRoleEnum.Assistant,
    [ChatRoleEnum.Human]: ChatCompletionRequestMessageRoleEnum.User,
    [ChatRoleEnum.System]: ChatCompletionRequestMessageRoleEnum.System
  };
  return messages.map((item) => ({
    ...(reserveId && { dataId: item.dataId }),
    role: map[item.obj] || ChatCompletionRequestMessageRoleEnum.System,
    content: item.value || ''
  }));
};

export function countOpenAIToken({ messages }: { messages: ChatItemType[] }) {
  const adaptMessages = adaptChatItem_openAI({ messages, reserveId: true });
  const token = adaptMessages.reduce((sum, item) => {
    const text = `${item.role}\n${item.content}`;

    /* use textLen as tokens if encode error */
    const tokens = (() => {
      try {
        const enc = getOpenAiEncMap();
        const encodeText = enc.encode(text);
        return encodeText.length + 3; // 补充估算值
      } catch (error) {
        return text.length;
      }
    })();

    return sum + tokens;
  }, 0);

  return token;
}

export const openAiSliceTextByToken = ({ text, length }: { text: string; length: number }) => {
  const enc = getOpenAiEncMap();

  try {
    const encodeText = enc.encode(text);
    const decoder = new TextDecoder();
    return decoder.decode(enc.decode(encodeText.slice(0, length)));
  } catch (error) {
    return text.slice(0, length);
  }
};

export const authOpenAiKey = async (key: string) => {
  return axios
    .get('https://ccdbwscohpmu.cloud.sealos.io/openai/v1/dashboard/billing/subscription', {
      headers: {
        Authorization: `Bearer ${key}`
      }
    })
    .then((res) => {
      if (!res.data.access_until) {
        return Promise.resolve('OpenAI Key 可能无效');
      }
    })
    .catch((err) => {
      console.log(err);
      return Promise.reject(err?.response?.data?.error?.message || 'OpenAI Key 可能无效');
    });
};
