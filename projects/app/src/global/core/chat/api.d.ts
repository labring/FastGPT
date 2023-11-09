import type { AppTTSConfigType } from '@/types/app';

export type GetChatSpeechProps = {
  chatItemId?: string;
  ttsConfig: AppTTSConfigType;
  input: string;
};
