import { OpenAiChatEnum } from '@/constants/model';
import type { ChatModelType } from '@/constants/model';
import type { ChatItemType } from '@/types/chat';
import { countOpenAIToken, openAiSliceTextByToken } from './openai';
import { gpt_chatItemTokenSlice } from '@/pages/api/openapi/text/gptMessagesSlice';

export const modelToolMap: Record<
  ChatModelType,
  {
    countTokens: (data: { messages: ChatItemType[] }) => number;
    sliceText: (data: { text: string; length: number }) => string;
    tokenSlice: (data: { messages: ChatItemType[]; maxToken: number }) => ChatItemType[];
  }
> = {
  [OpenAiChatEnum.GPT35]: {
    countTokens: ({ messages }) => countOpenAIToken({ model: OpenAiChatEnum.GPT35, messages }),
    sliceText: (data) => openAiSliceTextByToken({ model: OpenAiChatEnum.GPT35, ...data }),
    tokenSlice: (data) => gpt_chatItemTokenSlice({ model: OpenAiChatEnum.GPT35, ...data })
  },
  [OpenAiChatEnum.GPT3516k]: {
    countTokens: ({ messages }) => countOpenAIToken({ model: OpenAiChatEnum.GPT3516k, messages }),
    sliceText: (data) => openAiSliceTextByToken({ model: OpenAiChatEnum.GPT3516k, ...data }),
    tokenSlice: (data) => gpt_chatItemTokenSlice({ model: OpenAiChatEnum.GPT3516k, ...data })
  },
  [OpenAiChatEnum.GPT4]: {
    countTokens: ({ messages }) => countOpenAIToken({ model: OpenAiChatEnum.GPT4, messages }),
    sliceText: (data) => openAiSliceTextByToken({ model: OpenAiChatEnum.GPT4, ...data }),
    tokenSlice: (data) => gpt_chatItemTokenSlice({ model: OpenAiChatEnum.GPT4, ...data })
  },
  [OpenAiChatEnum.GPT432k]: {
    countTokens: ({ messages }) => countOpenAIToken({ model: OpenAiChatEnum.GPT432k, messages }),
    sliceText: (data) => openAiSliceTextByToken({ model: OpenAiChatEnum.GPT432k, ...data }),
    tokenSlice: (data) => gpt_chatItemTokenSlice({ model: OpenAiChatEnum.GPT432k, ...data })
  }
};
