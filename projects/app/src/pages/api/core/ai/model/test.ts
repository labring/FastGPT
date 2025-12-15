import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { findModelFromAlldata } from '@fastgpt/service/core/ai/model';
import {
  type EmbeddingModelItemType,
  type LLMModelItemType,
  type RerankModelItemType,
  type STTModelType,
  type TTSModelType
} from '@fastgpt/global/core/ai/model.d';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import { addLog } from '@fastgpt/service/common/system/log';
import { getVectorsByText } from '@fastgpt/service/core/ai/embedding';
import { reRankRecall } from '@fastgpt/service/core/ai/rerank';
import { aiTranscriptions } from '@fastgpt/service/core/ai/audio/transcriptions';
import { isProduction } from '@fastgpt/global/common/system/constants';
import * as fs from 'fs';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';

export type testQuery = { model: string; channelId?: number };

export type testBody = {};

export type testResponse = any;

async function handler(
  req: ApiRequestProps<testBody, testQuery>,
  res: ApiResponseType<any>
): Promise<testResponse> {
  await authSystemAdmin({ req });

  const { model, channelId } = req.query;
  const modelData = findModelFromAlldata(model);

  if (!modelData) return Promise.reject('Model not found');

  if (channelId) {
    delete modelData.requestUrl;
    delete modelData.requestAuth;
  }

  const headers: Record<string, string> = channelId
    ? {
        'Aiproxy-Channel': String(channelId)
      }
    : {};
  addLog.debug(`Test model`, modelData);

  if (modelData.type === 'llm') {
    return testLLMModel(modelData, headers);
  }
  if (modelData.type === 'embedding') {
    return testEmbeddingModel(modelData, headers);
  }
  if (modelData.type === 'tts') {
    return testTTSModel(modelData, headers);
  }
  if (modelData.type === 'stt') {
    return testSTTModel(modelData, headers);
  }
  if (modelData.type === 'rerank') {
    return testReRankModel(modelData, headers);
  }

  return Promise.reject('Model type not supported');
}

export default NextAPI(handler);

const testLLMModel = async (model: LLMModelItemType, headers: Record<string, string>) => {
  const { answerText } = await createLLMResponse({
    body: {
      model, // 传递实体 model 进去，保障底层不会去拿内存里的实体。
      messages: [{ role: 'user', content: 'hi' }],
      stream: true
    },
    custonHeaders: headers
  });

  if (answerText) {
    return answerText;
  }

  return Promise.reject('Model response empty');
};

const testEmbeddingModel = async (
  model: EmbeddingModelItemType,
  headers: Record<string, string>
) => {
  return getVectorsByText({
    input: 'Hi',
    model,
    headers
  });
};

const testTTSModel = async (model: TTSModelType, headers: Record<string, string>) => {
  const ai = getAIApi({
    timeout: 10000
  });
  await ai.audio.speech.create(
    {
      model: model.model,
      voice: model.voices[0]?.value as any,
      input: 'Hi',
      response_format: 'mp3',
      speed: 1
    },
    model.requestUrl
      ? {
          path: model.requestUrl,
          headers: {
            ...(model.requestAuth ? { Authorization: `Bearer ${model.requestAuth}` } : {}),
            ...headers
          }
        }
      : { headers }
  );
};

const testSTTModel = async (model: STTModelType, headers: Record<string, string>) => {
  const path = isProduction ? '/app/data/test.mp3' : 'data/test.mp3';
  const { text } = await aiTranscriptions({
    model,
    fileStream: fs.createReadStream(path),
    headers
  });
  addLog.info(`STT result: ${text}`);
};

const testReRankModel = async (model: RerankModelItemType, headers: Record<string, string>) => {
  await reRankRecall({
    model,
    query: 'Hi',
    documents: [{ id: '1', text: 'Hi' }],
    headers
  });
};
