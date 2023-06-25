import { encoding_for_model } from '@dqbd/tiktoken';
import type { ChatItemType } from '@/types/chat';
import { ChatRoleEnum } from '@/constants/chat';
import { ChatCompletionRequestMessageRoleEnum } from 'openai';
import { OpenAiChatEnum } from '@/constants/model';
import axios from 'axios';
import dayjs from 'dayjs';
import type { MessageItemType } from '@/pages/api/openapi/v1/chat/completions';

export const getOpenAiEncMap = () => {
  if (typeof window !== 'undefined' && window.OpenAiEncMap) {
    return window.OpenAiEncMap;
  }
  if (typeof global !== 'undefined' && global.OpenAiEncMap) {
    return global.OpenAiEncMap;
  }
  const enc = {
    [OpenAiChatEnum.GPT35]: encoding_for_model('gpt-3.5-turbo', {
      '<|im_start|>': 100264,
      '<|im_end|>': 100265,
      '<|im_sep|>': 100266
    }),
    [OpenAiChatEnum.GPT3516k]: encoding_for_model('gpt-3.5-turbo', {
      '<|im_start|>': 100264,
      '<|im_end|>': 100265,
      '<|im_sep|>': 100266
    }),
    [OpenAiChatEnum.GPT4]: encoding_for_model('gpt-4', {
      '<|im_start|>': 100264,
      '<|im_end|>': 100265,
      '<|im_sep|>': 100266
    }),
    [OpenAiChatEnum.GPT432k]: encoding_for_model('gpt-4-32k', {
      '<|im_start|>': 100264,
      '<|im_end|>': 100265,
      '<|im_sep|>': 100266
    })
  };

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
    ...(reserveId && { _id: item._id }),
    role: map[item.obj] || ChatCompletionRequestMessageRoleEnum.System,
    content: item.value || ''
  }));
};

export function countOpenAIToken({
  messages,
  model
}: {
  messages: ChatItemType[];
  model: `${OpenAiChatEnum}`;
}) {
  const diffVal = model.startsWith('gpt-3.5-turbo') ? 3 : 2;

  const adaptMessages = adaptChatItem_openAI({ messages, reserveId: true });
  const token = adaptMessages.reduce((sum, item) => {
    const text = `${item.role}\n${item.content}`;
    const enc = getOpenAiEncMap()[model];
    const encodeText = enc.encode(text);
    const tokens = encodeText.length + diffVal;
    return sum + tokens;
  }, 0);

  return token;
}

export const openAiSliceTextByToken = ({
  model = OpenAiChatEnum.GPT35,
  text,
  length
}: {
  model: `${OpenAiChatEnum}`;
  text: string;
  length: number;
}) => {
  const enc = getOpenAiEncMap()[model];
  const encodeText = enc.encode(text);
  const decoder = new TextDecoder();
  return decoder.decode(enc.decode(encodeText.slice(0, length)));
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
