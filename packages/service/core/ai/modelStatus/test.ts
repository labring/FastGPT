import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType,
  RerankSystemModelDataType,
  STTSystemModelDataType,
  SystemModelDataType,
  TTSSystemModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import { isProduction } from '@fastgpt/global/common/system/constants';
import { withTimeout } from '@fastgpt/global/common/system/utils';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { getAIApi } from '../config';
import { getVectors } from '../embedding';
import { aiTranscriptions } from '../audio/transcriptions';
import { reRankRecall } from '../rerank';
import { createLLMResponse } from '../llm/request';
import * as fs from 'fs';

const logger = getLogger(LogCategories.MODULE.AI.MODEL);

/**
 * 使用管理员「测试模型」的同一条调用链探测一个系统模型。
 * 支持 LLM、Embedding、TTS、STT、Rerank 五种模型类型：
 * - LLM: 发起一条包含简单 'hi' 的 stream 请求，不持久化 response 记录；
 * - Embedding: 对单条测试文本 'Hi' 生成向量；
 * - TTS: 取模型配置中的第一个音色合成 'Hi' 测试音频；
 * - STT: 读取预置的 test.mp3 样例音频进行转写测试；
 * - Rerank: 对单条文档进行重排打分测试。
 *
 * 支持传入 channelId 指定渠道测试；支持传入 timeoutMs 设置单次探测最大超时时间。
 * `timeoutMs` 只供后台探测设置请求上限，普通管理员手动测试不传入时保持原有行为。
 */
export const testSystemModel = async ({
  model,
  teamId,
  channelId,
  timeoutMs
}: {
  model: SystemModelDataType;
  teamId?: string;
  channelId?: number;
  timeoutMs?: number;
}) => {
  const headers: Record<string, string> =
    channelId === undefined ? {} : { 'Aiproxy-Channel': String(channelId) };

  const runTest = async () => {
    if (model.type === 'llm') {
      if (!teamId) throw new UserError('LLM model test requires a team');
      await testLLMModel({ model, headers, teamId });
      return;
    }
    if (model.type === 'embedding') {
      await testEmbeddingModel({ model, headers });
      return;
    }
    if (model.type === 'tts') {
      await testTTSModel({ model, headers, timeoutMs });
      return;
    }
    if (model.type === 'stt') {
      await testSTTModel({ model, headers });
      return;
    }
    if (model.type === 'rerank') {
      await testReRankModel({ model, headers });
      return;
    }

    return Promise.reject('Model type not supported');
  };

  if (timeoutMs === undefined) return runTest();
  return withTimeout(runTest(), timeoutMs, `Model test timed out after ${timeoutMs}ms`);
};

/**
 * 测试 LLM 模型连通性。
 * 以 stream 模式发送 'hi' 文本，返回非空回复即判定为测试成功。
 */
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

/**
 * 测试向量 Embedding 模型连通性。
 * 发送 'Hi' 文本向量化请求，成功解析返回的 vector 数组即判定为成功。
 */
const testEmbeddingModel = ({
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

/**
 * 测试语音合成 (TTS) 模型连通性。
 * 取模型默认配置的第一个音色，合成单句 'Hi' 的 mp3 音频流。
 */
const testTTSModel = async ({
  model,
  headers,
  timeoutMs
}: {
  model: TTSSystemModelDataType;
  headers: Record<string, string>;
  timeoutMs?: number;
}) => {
  const voice = model.config.voices[0]?.value;
  if (!voice) throw new UserError('TTS model test requires at least one voice');

  const { ai } = getAIApi({ timeout: timeoutMs ?? 60000 });
  await ai.audio.speech.create(
    {
      model: model.model,
      voice: voice as any,
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

/**
 * 测试语音识别 (STT) 模型连通性。
 * 读取测试音频 test.mp3 发送转写，成功返回识别文本即判定为成功。
 */
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

/**
 * 测试重排 (Rerank) 模型连通性。
 * 对 Query 'Hi' 与单条候选文档 'Hi' 进行打分召回。
 */
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
