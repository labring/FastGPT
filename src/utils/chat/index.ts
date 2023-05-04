import { ClaudeEnum, OpenAiChatEnum } from '@/constants/model';
import type { ChatModelType } from '@/constants/model';
import type { ChatItemSimpleType } from '@/types/chat';
import { countOpenAIToken, openAiSliceTextByToken } from './openai';
import { ClaudeSliceTextByToken } from './claude';

export const modelToolMap: Record<
  ChatModelType,
  {
    countTokens: (data: { messages: ChatItemSimpleType[] }) => number;
    sliceText: (data: { text: string; length: number }) => string;
  }
> = {
  [OpenAiChatEnum.GPT35]: {
    countTokens: ({ messages }) => countOpenAIToken({ model: OpenAiChatEnum.GPT35, messages }),
    sliceText: (data) => openAiSliceTextByToken({ model: OpenAiChatEnum.GPT35, ...data })
  },
  [OpenAiChatEnum.GPT4]: {
    countTokens: ({ messages }) => countOpenAIToken({ model: OpenAiChatEnum.GPT4, messages }),
    sliceText: (data) => openAiSliceTextByToken({ model: OpenAiChatEnum.GPT35, ...data })
  },
  [OpenAiChatEnum.GPT432k]: {
    countTokens: ({ messages }) => countOpenAIToken({ model: OpenAiChatEnum.GPT432k, messages }),
    sliceText: (data) => openAiSliceTextByToken({ model: OpenAiChatEnum.GPT35, ...data })
  },
  [ClaudeEnum.Claude]: {
    countTokens: () => 0,
    sliceText: ClaudeSliceTextByToken
  }
};
