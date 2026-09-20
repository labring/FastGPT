import type { Readable } from 'node:stream';
import { getAxiosConfig, getAiproxyScopeHeaders } from '../config';
import { normalizeRelayNoChannelError } from '../channel';
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

  const aiAxiosConfig = getAxiosConfig();
  onRequestStart?.();

  try {
    // 管理员配置的 url，允许是内网
    const { data: result } = await axiosWithoutSSRF.post<{
      text: string;
      usage?: { total_tokens: number };
    }>(modelData.requestUrl ? modelData.requestUrl : '/audio/transcriptions', data, {
      ...(modelData.requestUrl ? {} : { baseURL: aiAxiosConfig.baseUrl }),
      headers: {
        Authorization: modelData.requestAuth
          ? `Bearer ${modelData.requestAuth}`
          : aiAxiosConfig.authorization,
        ...data.getHeaders(),
        ...headers,
        ...getAiproxyScopeHeaders(modelData as any, aiAxiosConfig.baseUrl)
      },
      ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
      signal
    });

    return result;
  } catch (e) {
    throw normalizeRelayNoChannelError(e);
  }
};
