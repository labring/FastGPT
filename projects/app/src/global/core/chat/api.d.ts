import type { AppTTSConfigType } from '@fastgpt/global/core/module/type.d';

export type GetChatSpeechProps = {
  ttsConfig: AppTTSConfigType;
  input: string;
  shareId?: string;
};
