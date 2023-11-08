import { Text2SpeechVoiceEnum } from './constant';

export type Text2SpeechProps = {
  model?: string;
  voice?: `${Text2SpeechVoiceEnum}`;
  input: string;
  speed?: number;
};
