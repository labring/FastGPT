import type { NodeHttpResponse } from '../../../types/http';
import { getAIApi, getAiproxyScopeHeaders } from '../config';
import { normalizeRelayNoChannelError } from '../channel';
import { assertModelActive } from '../model/cache';
import type { TTSModelType } from '@fastgpt/global/core/ai/model/type';
import { Readable } from 'stream';

export async function text2Speech({
  res,
  onSuccess,
  onError,
  input,
  modelData,
  voice,
  speed = 1
}: {
  res: NodeHttpResponse;
  onSuccess: (e: { model: string; buffer: Buffer }) => void;
  onError: (e: any) => void;
  input: string;
  modelData: TTSModelType;
  voice: string;
  speed?: number;
}) {
  // Disabled models must never be callable at runtime (F2-S3-TC06).
  assertModelActive(modelData);
  const { ai, requestMeta } = getAIApi();
  let response;
  try {
    response = await ai.audio.speech.create(
      {
        model: modelData.model,
        // @ts-ignore
        voice,
        input,
        response_format: 'mp3',
        speed
      },
      {
        // Relay scope is a security attribute (design §2.9) — must always be present on the
        // aiproxy relay; no caller headers are merged here.
        headers: getAiproxyScopeHeaders(modelData, requestMeta.baseUrl)
      }
    );
  } catch (e) {
    // Relay "no available channel" (F2-S4-TC04) → ModelErrEnum.noAvailableChannel;
    // other errors pass through unchanged.
    throw normalizeRelayNoChannelError(e);
  }

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
    onSuccess({ model: modelData.model, buffer: Buffer.concat(chunks) });
  });
  readableStream.on('error', (e) => {
    onError(e);
  });
}
