import { countOpenAIToken, openAiSliceTextByToken } from './openai';
import { gpt_chatItemTokenSlice } from '@/pages/api/openapi/text/gptMessagesSlice';

export const modelToolMap = {
  countTokens: countOpenAIToken,
  sliceText: openAiSliceTextByToken,
  tokenSlice: gpt_chatItemTokenSlice
};
