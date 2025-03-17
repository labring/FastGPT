import type { NextApiResponse } from 'next';
import { getAIApi } from '../config';
import { getTTSModel } from '../model';

export async function text2Speech({
  res,
  onSuccess,
  onError,
  input,
  model,
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
  const modelData = getTTSModel(model)!;
  const ai = getAIApi();
  const response = await ai.audio.speech.create(
    {
      model,
      // @ts-ignore
      voice,
      input,
      response_format: 'mp3',
      speed
    },
    modelData.requestUrl && modelData.requestAuth
      ? {
          path: modelData.requestUrl,
          headers: {
            Authorization: `Bearer ${modelData.requestAuth}`
          }
        }
      : {}
  );

  const readableStream = response.body as unknown as NodeJS.ReadableStream;
  readableStream.pipe(res);

  const chunks: Uint8Array[] = [];

  readableStream.on('data', (chunk) => {
    chunks.push(chunk);
  });
  readableStream.on('end', () => {
    onSuccess({ model, buffer: Buffer.concat(chunks) });
  });
  readableStream.on('error', (e) => {
    onError(e);
  });
}
