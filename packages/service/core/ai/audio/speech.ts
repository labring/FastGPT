import type { NodeHttpResponse } from '../../../types/http';
import { getAIApi } from '../config';
import { Readable } from 'stream';
import type { TTSSystemModelDataType } from '@fastgpt/global/core/ai/model.schema';

export async function text2Speech({
  res,
  onSuccess,
  onError,
  input,
  model,
  voice,
  speed = 1
}: {
  res: NodeHttpResponse;
  onSuccess: (e: { model: TTSSystemModelDataType; buffer: Buffer }) => void;
  onError: (e: any) => void;
  input: string;
  model: TTSSystemModelDataType;
  voice: string;
  speed?: number;
}) {
  const { ai } = getAIApi();
  const response = await ai.audio.speech.create(
    {
      model: model.model,
      // @ts-ignore
      voice,
      input,
      response_format: 'mp3',
      speed
    },
    model.requestUrl
      ? {
          path: model.requestUrl,
          headers: {
            ...(model.requestAuth ? { Authorization: `Bearer ${model.requestAuth}` } : {})
          }
        }
      : {}
  );

  if (!response.body) {
    throw new Error('Response body is empty');
  }

  const readableStream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
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
