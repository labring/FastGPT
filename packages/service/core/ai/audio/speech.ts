import { Text2SpeechProps } from '@fastgpt/global/core/ai/speech/api';
import { getAIApi } from '../config';
import { defaultAudioSpeechModels } from '../../../../global/core/ai/model';
import { Text2SpeechVoiceEnum } from '@fastgpt/global/core/ai/speech/constant';

export async function text2Speech({
  model = defaultAudioSpeechModels[0].model,
  voice = Text2SpeechVoiceEnum.alloy,
  input,
  speed = 1
}: Text2SpeechProps) {
  const ai = getAIApi();
  const mp3 = await ai.audio.speech.create({
    model,
    voice,
    input,
    response_format: 'mp3',
    speed
  });
  const buffer = Buffer.from(await mp3.arrayBuffer());
  return {
    model,
    voice,
    tts: buffer
  };
}
