import type { Readable } from 'node:stream';
import { getModelAxiosConfig } from '../config';
import { normalizeRelayNoChannelError } from '../../../thirdProvider/aiproxy/error';
import { axiosWithoutSSRF } from '../../../common/api/axios';
import FormData from 'form-data';
import { type STTSystemModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { UserError } from '@fastgpt/global/common/error/utils';

export const aiTranscriptions = async ({
  model: modelData,
  fileStream,
  filename,
  headers,
  timeoutMs,
  signal,
  onRequestStart
}: {
  model: STTSystemModelDataType;
  fileStream: Readable;
  filename: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  onRequestStart?: () => void;
}) => {
  if (!modelData) {
    return Promise.reject(new UserError('no model'));
  }

  const data = new FormData();
  data.append('model', modelData.model);
  data.append('file', fileStream, { filename });

  const axiosConfig = getModelAxiosConfig({
    model: modelData,
    defaultPath: '/audio/transcriptions',
    headers: {
      ...data.getHeaders(),
      ...headers
    } as Record<string, string>
  });
  onRequestStart?.();

  try {
    const { data: result } = await axiosWithoutSSRF.post<{
      text: string;
      usage?: { total_tokens: number };
    }>(axiosConfig.url, data, {
      headers: axiosConfig.headers,
      ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
      signal
    });

    return result;
  } catch (e) {
    throw normalizeRelayNoChannelError(e);
  }
};
