import { encoding_for_model, type Tiktoken } from '@dqbd/tiktoken';
import type { ChatItemSimpleType } from '@/types/chat';
import { ChatRoleEnum } from '@/constants/chat';
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from 'openai';
import { OpenAiChatEnum } from '@/constants/model';
import Graphemer from 'graphemer';
import axios from 'axios';
import dayjs from 'dayjs';

const textDecoder = new TextDecoder();
const graphemer = new Graphemer();

export const getOpenAiEncMap = () => {
  if (typeof window !== 'undefined') {
    window.OpenAiEncMap = window.OpenAiEncMap || {
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
    return window.OpenAiEncMap;
  }
  if (typeof global !== 'undefined') {
    global.OpenAiEncMap = global.OpenAiEncMap || {
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
    return global.OpenAiEncMap;
  }
  return {
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
};

export const adaptChatItem_openAI = ({
  messages
}: {
  messages: ChatItemSimpleType[];
}): ChatCompletionRequestMessage[] => {
  const map = {
    [ChatRoleEnum.AI]: ChatCompletionRequestMessageRoleEnum.Assistant,
    [ChatRoleEnum.Human]: ChatCompletionRequestMessageRoleEnum.User,
    [ChatRoleEnum.System]: ChatCompletionRequestMessageRoleEnum.System
  };
  return messages.map((item) => ({
    role: map[item.obj] || ChatCompletionRequestMessageRoleEnum.System,
    content: item.value || ''
  }));
};

export function countOpenAIToken({
  messages,
  model
}: {
  messages: ChatItemSimpleType[];
  model: `${OpenAiChatEnum}`;
}) {
  function getChatGPTEncodingText(
    messages: {
      role: 'system' | 'user' | 'assistant';
      content: string;
      name?: string;
    }[],
    model: `${OpenAiChatEnum}`
  ) {
    const isGpt3 = model.startsWith('gpt-3.5-turbo');

    const msgSep = isGpt3 ? '\n' : '';
    const roleSep = isGpt3 ? '\n' : '<|im_sep|>';

    return [
      messages
        .map(({ name = '', role, content }) => {
          return `<|im_start|>${name || role}${roleSep}${content}<|im_end|>`;
        })
        .join(msgSep),
      `<|im_start|>assistant${roleSep}`
    ].join(msgSep);
  }
  function text2TokensLen(encoder: Tiktoken, inputText: string) {
    const encoding = encoder.encode(inputText, 'all');
    const segments: { text: string; tokens: { id: number; idx: number }[] }[] = [];

    let byteAcc: number[] = [];
    let tokenAcc: { id: number; idx: number }[] = [];
    let inputGraphemes = graphemer.splitGraphemes(inputText);

    for (let idx = 0; idx < encoding.length; idx++) {
      const token = encoding[idx]!;
      byteAcc.push(...encoder.decode_single_token_bytes(token));
      tokenAcc.push({ id: token, idx });

      const segmentText = textDecoder.decode(new Uint8Array(byteAcc));
      const graphemes = graphemer.splitGraphemes(segmentText);

      if (graphemes.every((item, idx) => inputGraphemes[idx] === item)) {
        segments.push({ text: segmentText, tokens: tokenAcc });

        byteAcc = [];
        tokenAcc = [];
        inputGraphemes = inputGraphemes.slice(graphemes.length);
      }
    }

    return segments.reduce((memo, i) => memo + i.tokens.length, 0) ?? 0;
  }

  const adaptMessages = adaptChatItem_openAI({ messages });

  return text2TokensLen(getOpenAiEncMap()[model], getChatGPTEncodingText(adaptMessages, model));
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
        return Promise.reject('OpenAI Key 无效，请重试或更换 key');
      }
      const keyExpiredTime = dayjs(res.data.access_until * 1000);
      const currentTime = dayjs();
      if (keyExpiredTime.isBefore(currentTime)) {
        return Promise.reject('OpenAI Key 已过期');
      }
    })
    .catch((err) => {
      console.log(err);
      return Promise.reject(err?.response?.data?.error || 'OpenAI 账号无效，请重试或更换 key');
    });
};
