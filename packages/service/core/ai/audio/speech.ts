import type { NextApiResponse } from 'next';
import { getAIApi } from '../config';
import { getTTSModelById } from '../model';

export async function text2Speech({
  res,
  onSuccess,
  onError,
  input,
  modelId,
  voice,
  speed = 1
}: {
  res: NextApiResponse;
  onSuccess: (e: { modelId: string; buffer: Buffer }) => void;
  onError: (e: any) => void;
  input: string;
  modelId: string;
  voice: string;
  speed?: number;
}) {
  const modelData = getTTSModelById(modelId)!;
  const ai = getAIApi();
  const response = await ai.audio.speech.create(
    {
      model: modelData.model,
      // @ts-ignore
      voice,
      input,
      response_format: 'mp3',
      speed
    },
    modelData.requestUrl
      ? {
          path: modelData.requestUrl,
          headers: {
            ...(modelData.requestAuth ? { Authorization: `Bearer ${modelData.requestAuth}` } : {})
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
    onSuccess({ modelId: modelData.id, buffer: Buffer.concat(chunks) });
  });
  readableStream.on('error', (e) => {
    onError(e);
  });
}
