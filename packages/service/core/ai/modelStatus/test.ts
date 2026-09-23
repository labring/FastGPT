import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType,
  RerankSystemModelDataType,
  STTSystemModelDataType,
  SystemModelDataType,
  TTSSystemModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import { isProduction } from '@fastgpt/global/common/system/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { getAIApi } from '../config';
import { getVectors } from '../embedding';
import { aiTranscriptions } from '../audio/transcriptions';
import { reRankRecall } from '../rerank';
import { createLLMResponse } from '../llm/request';
import * as fs from 'fs';

const logger = getLogger(LogCategories.MODULE.AI.MODEL);

/** 管理员手动测试与后台探测统一使用的单次模型请求超时。 */
export const MODEL_STATUS_REQUEST_TIMEOUT_MS = 60000;

/**
 * 使用管理员「测试模型」的同一条调用链探测一个系统模型。
 * 支持 LLM、Embedding、TTS、STT、Rerank 五种模型类型：
 * - LLM: 发起一条包含简单 'hi' 的 stream 请求，不持久化 response 记录；
 * - Embedding: 对单条测试文本 'Hi' 生成向量；
 * - TTS: 取模型配置中的第一个音色合成 'Hi' 测试音频；
 * - STT: 读取预置的 test.mp3 样例音频进行转写测试；
 * - Rerank: 对单条文档进行重排打分测试。
 *
 * 支持传入 channelId 指定渠道测试；所有模型类型统一使用 60 秒请求超时。
 * 超时由 AbortSignal 传到实际 HTTP 客户端，终止底层请求，而不是只提前结束外层 Promise。
 */
export const testSystemModel = async ({
  model,
  teamId,
  channelId,
  timeoutMs = MODEL_STATUS_REQUEST_TIMEOUT_MS,
  signal: parentSignal,
  onRequestStart
}: {
  model: SystemModelDataType;
  teamId?: string;
  channelId?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onRequestStart?: () => void;
}) => {
  const headers: Record<string, string> =
    channelId === undefined ? {} : { 'Aiproxy-Channel': String(channelId) };

  const runTest = async (signal: AbortSignal) => {
    if (model.type === 'llm') {
      if (!teamId) throw new UserError('LLM model test requires a team');
      await testLLMModel({ model, headers, teamId, timeoutMs, signal, onRequestStart });
      return;
    }
    if (model.type === 'embedding') {
      await testEmbeddingModel({ model, headers, timeoutMs, signal, onRequestStart });
      return;
    }
    if (model.type === 'tts') {
      await testTTSModel({ model, headers, timeoutMs, signal, onRequestStart });
      return;
    }
    if (model.type === 'stt') {
      await testSTTModel({ model, headers, timeoutMs, signal, onRequestStart });
      return;
    }
    if (model.type === 'rerank') {
      await testReRankModel({ model, headers, timeoutMs, signal, onRequestStart });
      return;
    }

    return Promise.reject('Model type not supported');
  };

  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(
    () => timeoutController.abort(new Error(`Model test timed out after ${timeoutMs}ms`)),
    timeoutMs
  );
  const signal = parentSignal
    ? AbortSignal.any([parentSignal, timeoutController.signal])
    : timeoutController.signal;

  try {
    return await runTest(signal);
  } catch (error) {
    // OpenAI/Axios may normalize abort errors; preserve the actionable timeout reason.
    if (timeoutController.signal.aborted) throw timeoutController.signal.reason ?? error;
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

/**
 * 测试 LLM 模型连通性。
 * 以 stream 模式发送 'hi' 文本，返回非空回复即判定为测试成功。
 */
const testLLMModel = async ({
  model,
  headers,
  teamId,
  timeoutMs,
  signal,
  onRequestStart
}: {
  model: LLMSystemModelDataType;
  headers: Record<string, string>;
  teamId: string;
  timeoutMs: number;
  signal: AbortSignal;
  onRequestStart?: () => void;
}) => {
  const { answerText } = await createLLMResponse({
    teamId,
    saveLLMResponseRecord: false,
    body: {
      model,
      messages: [{ role: 'user', content: 'hi' }],
      stream: true
    },
    custonHeaders: headers,
    timeout: timeoutMs,
    signal,
    maxRetries: 0,
    onRequestStart
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
  headers,
  timeoutMs,
  signal,
  onRequestStart
}: {
  model: EmbeddingSystemModelDataType;
  headers: Record<string, string>;
  timeoutMs: number;
  signal: AbortSignal;
  onRequestStart?: () => void;
}) =>
  getVectors({
    model,
    inputs: [{ type: 'text', input: 'Hi' }],
    headers,
    timeoutMs,
    signal,
    onRequestStart
  });

/**
 * 测试语音合成 (TTS) 模型连通性。
 * 取模型默认配置的第一个音色，合成单句 'Hi' 的 mp3 音频流。
 */
const testTTSModel = async ({
  model,
  headers,
  timeoutMs,
  signal,
  onRequestStart
}: {
  model: TTSSystemModelDataType;
  headers: Record<string, string>;
  timeoutMs: number;
  signal: AbortSignal;
  onRequestStart?: () => void;
}) => {
  const voice = model.config.voices[0]?.value;
  if (!voice) throw new UserError('TTS model test requires at least one voice');

  const { ai } = getAIApi({ timeout: timeoutMs });
  onRequestStart?.();
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
          },
          signal,
          maxRetries: 0
        }
      : { headers, signal, maxRetries: 0 }
  );
};

/**
 * 测试语音识别 (STT) 模型连通性。
 * 读取测试音频 test.mp3 发送转写，成功返回识别文本即判定为成功。
 */
const testSTTModel = async ({
  model,
  headers,
  timeoutMs,
  signal,
  onRequestStart
}: {
  model: STTSystemModelDataType;
  headers: Record<string, string>;
  timeoutMs: number;
  signal: AbortSignal;
  onRequestStart?: () => void;
}) => {
  const path = isProduction ? '/app/data/test.mp3' : 'data/test.mp3';
  const { text } = await aiTranscriptions({
    model,
    fileStream: fs.createReadStream(path),
    filename: 'test.mp3',
    headers,
    timeoutMs,
    signal,
    onRequestStart
  });
  logger.info(`STT result: ${text}`);
};

/**
 * 测试重排 (Rerank) 模型连通性。
 * 对 Query 'Hi' 与单条候选文档 'Hi' 进行打分召回。
 */
const testReRankModel = async ({
  model,
  headers,
  timeoutMs,
  signal,
  onRequestStart
}: {
  model: RerankSystemModelDataType;
  headers: Record<string, string>;
  timeoutMs: number;
  signal: AbortSignal;
  onRequestStart?: () => void;
}) => {
  await reRankRecall({
    model,
    query: 'Hi',
    documents: [{ id: '1', text: 'Hi' }],
    headers,
    timeoutMs,
    signal,
    onRequestStart
  });
};
