import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { findModelFromAlldata, getReRankModel } from '@fastgpt/service/core/ai/model';
import {
  EmbeddingModelItemType,
  LLMModelItemType,
  ReRankModelItemType,
  STTModelType,
  TTSModelType
} from '@fastgpt/global/core/ai/model.d';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import { addLog } from '@fastgpt/service/common/system/log';
import { getVectorsByText } from '@fastgpt/service/core/ai/embedding';
import { reRankRecall } from '@fastgpt/service/core/ai/rerank';
import { aiTranscriptions } from '@fastgpt/service/core/ai/audio/transcriptions';
import { isProduction } from '@fastgpt/global/common/system/constants';
import * as fs from 'fs';
import { llmCompletionsBodyFormat } from '@fastgpt/service/core/ai/utils';

export type testQuery = { model: string };

export type testBody = {};

export type testResponse = any;

async function handler(
  req: ApiRequestProps<testBody, testQuery>,
  res: ApiResponseType<any>
): Promise<testResponse> {
  await authSystemAdmin({ req });

  const { model } = req.query;
  const modelData = findModelFromAlldata(model);

  if (!modelData) return Promise.reject('Model not found');

  if (modelData.type === 'llm') {
    return testLLMModel(modelData);
  }
  if (modelData.type === 'embedding') {
    return testEmbeddingModel(modelData);
  }
  if (modelData.type === 'tts') {
    return testTTSModel(modelData);
  }
  if (modelData.type === 'stt') {
    return testSTTModel(modelData);
  }
  if (modelData.type === 'rerank') {
    return testReRankModel(modelData);
  }

  return Promise.reject('Model type not supported');
}

export default NextAPI(handler);

const testLLMModel = async (model: LLMModelItemType) => {
  const ai = getAIApi({
    timeout: 10000
  });

  const requestBody = llmCompletionsBodyFormat(
    {
      model: model.model,
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
      max_tokens: 10
    },
    model
  );
  const response = await ai.chat.completions.create(requestBody, {
    ...(model.requestUrl ? { path: model.requestUrl } : {}),
    headers: model.requestAuth
      ? {
          Authorization: `Bearer ${model.requestAuth}`
        }
      : undefined
  });

  const responseText = response.choices?.[0]?.message?.content;
  // @ts-ignore
  const reasoning_content = response.choices?.[0]?.message?.reasoning_content;

  if (!responseText && !reasoning_content) {
    return Promise.reject('Model response empty');
  }

  addLog.info(`Model test response: ${responseText}`);
};

const testEmbeddingModel = async (model: EmbeddingModelItemType) => {
  return getVectorsByText({
    input: 'Hi',
    model
  });
};

const testTTSModel = async (model: TTSModelType) => {
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
          headers: model.requestAuth
            ? {
                Authorization: `Bearer ${model.requestAuth}`
              }
            : undefined
        }
      : {}
  );
};

const testSTTModel = async (model: STTModelType) => {
  const path = isProduction ? '/app/data/test.mp3' : 'data/test.mp3';
  const { text } = await aiTranscriptions({
    model: model.model,
    fileStream: fs.createReadStream(path)
  });
  addLog.info(`STT result: ${text}`);
};

const testReRankModel = async (model: ReRankModelItemType) => {
  await reRankRecall({
    model,
    query: 'Hi',
    documents: [{ id: '1', text: 'Hi' }]
  });
};
