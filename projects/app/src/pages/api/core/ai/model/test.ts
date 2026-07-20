import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModel } from '@fastgpt/service/support/permission/model/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  type EmbeddingModelItemType,
  type LLMModelItemType,
  type RerankModelItemType,
  type STTModelType,
  type TTSModelType
} from '@fastgpt/global/core/ai/model/type';
import { getAIApi, getAiproxyScopeHeaders } from '@fastgpt/service/core/ai/config';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getVectors } from '@fastgpt/service/core/ai/embedding';
import { reRankRecall } from '@fastgpt/service/core/ai/rerank';
import { aiTranscriptions } from '@fastgpt/service/core/ai/audio/transcriptions';
import { isProduction } from '@fastgpt/global/common/system/constants';
import * as fs from 'fs';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { addAuditLog, getI18nModelType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  TestModelQuerySchema,
  TestModelResponseSchema,
  type TestModelQuery,
  type TestModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
const logger = getLogger(LogCategories.MODULE.AI.MODEL);

async function handler(
  req: ApiRequestProps<Record<string, never>, TestModelQuery>
): Promise<TestModelResponse> {
  const { id: modelId, channelId } = parseApiInput({
    req,
    querySchema: TestModelQuerySchema
  }).query;

  const { modelData, teamId, tmbId } = await authModel({
    modelId,
    per: ReadPermissionVal,
    req,
    authToken: true
  });

  if (!modelData) return Promise.reject('Model not found');

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.TEST_MODEL,
      params: {
        modelName: modelData.name || modelData.model,
        modelType: getI18nModelType(modelData.type)
      }
    });
  })();

  // Build channel header if channelId is provided; the proxy/router uses this header for routing.
  const headers: Record<string, string> = channelId
    ? {
        'Aiproxy-Channel': String(channelId)
      }
    : {};
  logger.debug(`Test model`, modelData);

  if (modelData.type === 'llm') {
    return TestModelResponseSchema.parse(await testLLMModel(modelData, headers, teamId));
  }
  if (modelData.type === 'embedding') {
    return TestModelResponseSchema.parse(await testEmbeddingModel(modelData, headers));
  }
  if (modelData.type === 'tts') {
    return TestModelResponseSchema.parse(await testTTSModel(modelData, headers));
  }
  if (modelData.type === 'stt') {
    return TestModelResponseSchema.parse(await testSTTModel(modelData, headers));
  }
  if (modelData.type === 'rerank') {
    return TestModelResponseSchema.parse(await testReRankModel(modelData, headers));
  }

  return Promise.reject('Model type not supported');
}

export default NextAPI(handler);

const testLLMModel = async (
  modelData: LLMModelItemType,
  headers: Record<string, string>,
  teamId: string
) => {
  const { answerText } = await createLLMResponse({
    teamId,
    modelData,
    saveLLMResponseRecord: false,
    body: {
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
  modelData: EmbeddingModelItemType,
  headers: Record<string, string>
) => {
  return getVectors({
    modelData,
    inputs: [
      {
        type: 'text',
        input: 'Hi'
      }
    ],
    headers
  });
};

const testTTSModel = async (modelData: TTSModelType, headers: Record<string, string>) => {
  const { ai, requestMeta } = getAIApi({
    timeout: 10000
  });
  await ai.audio.speech.create(
    {
      model: modelData.model,
      voice: modelData.voices[0]?.value as any,
      input: 'Hi',
      response_format: 'mp3',
      speed: 1
    },
    {
      headers: {
        ...headers,
        // Relay scope is a security attribute (design §2.9) — it must win over any
        // caller-provided header (e.g. Aiproxy-Channel channel lock).
        ...getAiproxyScopeHeaders(modelData, requestMeta.baseUrl)
      }
    }
  );
};

const testSTTModel = async (modelData: STTModelType, headers: Record<string, string>) => {
  const path = isProduction ? '/app/data/test.mp3' : 'data/test.mp3';
  const { text } = await aiTranscriptions({
    modelData,
    fileStream: fs.createReadStream(path),
    filename: 'test.mp3',
    headers
  });
  logger.info(`STT result: ${text}`);
};

const testReRankModel = async (modelData: RerankModelItemType, headers: Record<string, string>) => {
  await reRankRecall({
    modelData,
    query: 'Hi',
    documents: [{ id: '1', text: 'Hi' }],
    headers
  });
};
