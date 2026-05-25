import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  type EmbeddingModelItemType,
  type LLMModelItemType,
  type RerankModelItemType,
  type STTModelType,
  type TTSModelType
} from '@fastgpt/global/core/ai/model.schema';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getVectorsByText } from '@fastgpt/service/core/ai/embedding';
import { reRankRecall } from '@fastgpt/service/core/ai/rerank';
import { aiTranscriptions } from '@fastgpt/service/core/ai/audio/transcriptions';
import { isProduction } from '@fastgpt/global/common/system/constants';
import * as fs from 'fs';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { authModel } from '@fastgpt/service/support/permission/model/auth';
import {
  TestModelQuerySchema,
  type TestModelQuery
} from '@fastgpt/global/openapi/core/ai/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
const logger = getLogger(LogCategories.MODULE.AI.MODEL);

async function handler(
  req: ApiRequestProps<TestModelQuery, TestModelQuery>,
  res: ApiResponseType<any>
): Promise<any> {
  const { id, channelId } = TestModelQuerySchema.parse({
    ...req.query,
    ...req.body
  });
  const { model: rawModelData } = await authModel({
    req,
    authToken: true,
    authApiKey: true,
    modelId: id,
    per: ReadPermissionVal
  });

  const headers: Record<string, string> = channelId
    ? {
        'Aiproxy-Channel': String(channelId)
      }
    : {};
  const modelData = channelId
    ? {
        ...rawModelData,
        requestUrl: undefined,
        requestAuth: undefined
      }
    : rawModelData;
  logger.debug(`Test model`, modelData);

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

  return Promise.reject(ModelErrEnum.modelTypeNotSupported);
}

export default NextAPI(handler);

const testLLMModel = async (model: LLMModelItemType, headers: Record<string, string>) => {
  const { answerText } = await createLLMResponse({
    body: {
      modelId: model.id,
      messages: [{ role: 'user', content: 'hi' }],
      stream: true
    },
    custonHeaders: headers
  });

  if (answerText) {
    return answerText;
  }

  return Promise.reject(ModelErrEnum.modelResponseEmpty);
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
  logger.info(`STT result: ${text}`);
};

const testReRankModel = async (model: RerankModelItemType, headers: Record<string, string>) => {
  await reRankRecall({
    model,
    query: 'Hi',
    documents: [{ id: '1', text: 'Hi' }],
    headers
  });
};
