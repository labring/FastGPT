import type { Readable } from 'node:stream';
import { getAxiosConfig, getAiproxyScopeHeaders } from '../config';
import { normalizeRelayNoChannelError } from '../channel';
import { assertModelActive } from '../model/cache';
import { axiosWithoutSSRF } from '../../../common/api/axios';
import FormData from 'form-data';
import { type STTModelType } from '@fastgpt/global/core/ai/model/type';
import { UserError } from '@fastgpt/global/common/error/utils';

export const aiTranscriptions = async ({
  modelData,
  fileStream,
  filename,
  headers
}: {
  modelData: STTModelType;
  fileStream: Readable;
  filename: string;
  headers?: Record<string, string>;
}) => {
  if (!modelData) {
    return Promise.reject(new UserError('no model'));
  }
  // Disabled models must never be callable at runtime (F2-S3-TC06).
  assertModelActive(modelData);

  const data = new FormData();
  data.append('model', modelData.model);
  data.append('file', fileStream, { filename });

  const aiAxiosConfig = getAxiosConfig();

  try {
    // 管理员配置的 url，允许是内网
    const { data: result } = await axiosWithoutSSRF.post<{
      text: string;
      usage?: { total_tokens: number };
    }>('/audio/transcriptions', data, {
      baseURL: aiAxiosConfig.baseUrl,
      headers: {
        Authorization: aiAxiosConfig.authorization,
        ...data.getHeaders(),
        ...headers,
        // Relay scope is a security attribute (design §2.9) — it must win over any
        // caller-provided header (e.g. Aiproxy-Channel channel lock).
        ...getAiproxyScopeHeaders(modelData, aiAxiosConfig.baseUrl)
      }
    });

    return result;
  } catch (e) {
    // Relay "no available channel" (F2-S4-TC04) → ModelErrEnum.noAvailableChannel;
    // other errors pass through unchanged.
    throw normalizeRelayNoChannelError(e);
  }
};
