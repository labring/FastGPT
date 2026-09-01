import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { findModelData } from '@fastgpt/service/core/ai/model';
import {
  type EmbeddingSystemModelDataType,
  type LLMSystemModelDataType,
  type RerankSystemModelDataType,
  type STTSystemModelDataType,
  type TTSSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getVectors } from '@fastgpt/service/core/ai/embedding';
import { reRankRecall } from '@fastgpt/service/core/ai/rerank';
import { aiTranscriptions } from '@fastgpt/service/core/ai/audio/transcriptions';
import { isProduction } from '@fastgpt/global/common/system/constants';
import * as fs from 'fs';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  TestAdminSystemModelQuerySchema,
  TestAdminSystemModelResponseSchema,
  type TestAdminSystemModelQuery,
  type TestAdminSystemModelResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

const logger = getLogger(LogCategories.MODULE.AI.MODEL);

async function handler(
  req: ApiRequestProps<Record<string, never>, TestAdminSystemModelQuery>
): Promise<TestAdminSystemModelResponse> {
  const { teamId } = await authSystemAdmin({ req });
  const { modelId, channelId } = parseApiInput({
    req,
    querySchema: TestAdminSystemModelQuerySchema
  }).query;
  const modelData = findModelData({ modelId });
  if (!modelData) return Promise.reject(ModelErrEnum.unExist);

  if (channelId) {
    delete modelData.requestUrl;
    delete modelData.requestAuth;
  }

  const headers: Record<string, string> = channelId ? { 'Aiproxy-Channel': String(channelId) } : {};
  logger.debug('Test model', modelData);

  if (modelData.type === 'llm') {
    return TestAdminSystemModelResponseSchema.parse(
      await testLLMModel({ model: modelData, headers, teamId })
    );
  }
  if (modelData.type === 'embedding') {
    return TestAdminSystemModelResponseSchema.parse(
      await testEmbeddingModel({ model: modelData, headers })
    );
  }
  if (modelData.type === 'tts') {
    return TestAdminSystemModelResponseSchema.parse(
      await testTTSModel({ model: modelData, headers })
    );
  }
  if (modelData.type === 'stt') {
    return TestAdminSystemModelResponseSchema.parse(
      await testSTTModel({ model: modelData, headers })
    );
  }
  if (modelData.type === 'rerank') {
    return TestAdminSystemModelResponseSchema.parse(
      await testReRankModel({ model: modelData, headers })
    );
  }

  return Promise.reject('Model type not supported');
}

export default NextAPI(handler);

const testLLMModel = async ({
  model,
  headers,
  teamId
}: {
  model: LLMSystemModelDataType;
  headers: Record<string, string>;
  teamId: string;
}) => {
  const { answerText } = await createLLMResponse({
    teamId,
    saveLLMResponseRecord: false,
    body: {
      model,
      messages: [{ role: 'user', content: 'hi' }],
      stream: true
    },
    custonHeaders: headers
  });

  if (answerText) return answerText;
  return Promise.reject('Model response empty');
};

const testEmbeddingModel = async ({
  model,
  headers
}: {
  model: EmbeddingSystemModelDataType;
  headers: Record<string, string>;
}) =>
  getVectors({
    model,
    inputs: [{ type: 'text', input: 'Hi' }],
    headers
  });

const testTTSModel = async ({
  model,
  headers
}: {
  model: TTSSystemModelDataType;
  headers: Record<string, string>;
}) => {
  const { ai } = getAIApi({ timeout: 10000 });
  await ai.audio.speech.create(
    {
      model: model.model,
      voice: model.config.voices[0]?.value as any,
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

const testSTTModel = async ({
  model,
  headers
}: {
  model: STTSystemModelDataType;
  headers: Record<string, string>;
}) => {
  const path = isProduction ? '/app/data/test.mp3' : 'data/test.mp3';
  const { text } = await aiTranscriptions({
    model,
    fileStream: fs.createReadStream(path),
    filename: 'test.mp3',
    headers
  });
  logger.info(`STT result: ${text}`);
};

const testReRankModel = async ({
  model,
  headers
}: {
  model: RerankSystemModelDataType;
  headers: Record<string, string>;
}) => {
  await reRankRecall({
    model,
    query: 'Hi',
    documents: [{ id: '1', text: 'Hi' }],
    headers
  });
};
