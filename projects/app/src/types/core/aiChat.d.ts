import { SystemInputEnum } from '@/constants/app';

/* ai chat modules props */
export type AIChatProps = {
  model: string;
  systemPrompt?: string;
  temperature: number;
  maxToken: number;
  [SystemInputEnum.isResponseAnswerText]: boolean;
  quoteTemplate?: string;
  quotePrompt?: string;
  frequency: number;
  presence: number;
};
