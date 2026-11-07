import type { NodeHttpResponse } from '../../../types/http';
import { getAIApi, getModelOpenAIOptions } from '../config';
import { normalizeRelayNoChannelError } from '../../../thirdProvider/aiproxy/error';
import { Readable } from 'stream';
import type { TTSModelDataType } from '@fastgpt/global/core/ai/model/schema';

/** 生产播报与模型探测共用的 TTS 请求入口，统一路由、超时、取消和无可用渠道错误。 */
export const requestSpeech = async ({
  model,
  voice,
  input,
  speed = 1,
  timeoutMs,
  signal,
  headers,
  maxRetries,
  onRequestStart
}: {
  model: TTSModelDataType;
  voice: string;
  input: string;
  speed?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  maxRetries?: number;
  onRequestStart?: () => void;
}) => {
  const { ai, requestMeta } = getAIApi(
    timeoutMs === undefined ? undefined : { timeout: timeoutMs }
  );
  onRequestStart?.();
  try {
    return await ai.audio.speech.create(
      {
        model: model.model,
        // 上游兼容服务支持自定义音色，配置值不受 OpenAI 内置音色枚举限制。
        voice: voice as Parameters<typeof ai.audio.speech.create>[0]['voice'],
        input,
        response_format: 'mp3',
        speed
      },
      getModelOpenAIOptions({ model, baseUrl: requestMeta.baseUrl, signal, headers, maxRetries })
    );
  } catch (error) {
    throw normalizeRelayNoChannelError(error);
  }
};

/** 将合成音频输出到 HTTP 响应，并在完整读取后交付缓存 Buffer；请求逻辑由 requestSpeech 负责。 */
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
  onSuccess: (e: { model: TTSModelDataType; buffer: Buffer }) => void;
  onError: (e: any) => void;
  input: string;
  model: TTSModelDataType;
  voice: string;
  speed?: number;
}) {
  const response = await requestSpeech({ model, voice, input, speed });

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
