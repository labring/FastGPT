import type { NextApiResponse } from 'next';
import { getAIApi } from '../config';
import { defaultAudioSpeechModels } from '../../../../global/core/ai/model';
import { UserModelSchema } from '@fastgpt/global/support/user/type';

export async function text2Speech({
  res,
  onSuccess,
  onError,
  input,
  model = defaultAudioSpeechModels[0].model,
  voice,
  speed = 1
}: {
  res: NextApiResponse;
  onSuccess: (e: { model: string; buffer: Buffer }) => void;
  onError: (e: any) => void;
  input: string;
  model: string;
  voice: string;
  speed?: number;
}) {
  const ai = getAIApi();
  const response = await ai.audio.speech.create({
    model,
    // @ts-ignore
    voice,
    input,
    response_format: 'mp3',
    speed
  });

  const readableStream = response.body as unknown as NodeJS.ReadableStream;
  readableStream.pipe(res);

  let bufferStore = Buffer.from([]);

  readableStream.on('data', (chunk) => {
    bufferStore = Buffer.concat([bufferStore, chunk]);
  });
  readableStream.on('end', () => {
    onSuccess({ model, buffer: bufferStore });
  });
  readableStream.on('error', (e) => {
    onError(e);
  });
}
