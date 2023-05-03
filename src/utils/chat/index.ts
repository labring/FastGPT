import { OpenAiChatEnum } from '@/constants/model';
import type { ChatModelType } from '@/constants/model';
import type { ChatItemSimpleType } from '@/types/chat';
import { countOpenAIToken, getOpenAiEncMap, adaptChatItem_openAI } from './openai';

export type CountTokenType = { messages: ChatItemSimpleType[] };

export const modelToolMap = {
  [OpenAiChatEnum.GPT35]: {
    countTokens: ({ messages }: CountTokenType) =>
      countOpenAIToken({ model: OpenAiChatEnum.GPT35, messages }),
    adaptChatMessages: adaptChatItem_openAI
  },
  [OpenAiChatEnum.GPT4]: {
    countTokens: ({ messages }: CountTokenType) =>
      countOpenAIToken({ model: OpenAiChatEnum.GPT4, messages }),
    adaptChatMessages: adaptChatItem_openAI
  },
  [OpenAiChatEnum.GPT432k]: {
    countTokens: ({ messages }: CountTokenType) =>
      countOpenAIToken({ model: OpenAiChatEnum.GPT432k, messages }),
    adaptChatMessages: adaptChatItem_openAI
  }
};

export const sliceTextByToken = ({
  model = 'gpt-3.5-turbo',
  text,
  length
}: {
  model: ChatModelType;
  text: string;
  length: number;
}) => {
  const enc = getOpenAiEncMap()[model];
  const encodeText = enc.encode(text);
  const decoder = new TextDecoder();
  return decoder.decode(enc.decode(encodeText.slice(0, length)));
};
