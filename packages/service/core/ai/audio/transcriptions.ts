import type fs from 'fs';
import { getAxiosConfig } from '../config';
import axios from 'axios';
import FormData from 'form-data';
import { type STTModelType } from '@fastgpt/global/core/ai/model.d';
import { UserError } from '@fastgpt/global/common/error/utils';

export const aiTranscriptions = async ({
  model: modelData,
  fileStream,
  headers
}: {
  model: STTModelType;
  fileStream: fs.ReadStream;
  headers?: Record<string, string>;
}) => {
  if (!modelData) {
    return Promise.reject(new UserError('no model'));
  }

  const data = new FormData();
  data.append('model', modelData.model);
  data.append('file', fileStream);

  const aiAxiosConfig = getAxiosConfig();

  const { data: result } = await axios<{ text: string; usage?: { total_tokens: number } }>({
    method: 'post',
    ...(modelData.requestUrl
      ? { url: modelData.requestUrl }
      : {
          baseURL: aiAxiosConfig.baseUrl,
          url: '/audio/transcriptions'
        }),
    headers: {
      Authorization: modelData.requestAuth
        ? `Bearer ${modelData.requestAuth}`
        : aiAxiosConfig.authorization,
      ...data.getHeaders(),
      ...headers
    },
    data: data
  });

  return result;
};
