import type { AppTTSConfigType } from '@/types/app';

export type GetChatSpeechProps = {
  ttsConfig: AppTTSConfigType;
  input: string;
};
