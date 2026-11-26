import type {
  EmbeddingModelDataType,
  LLMModelDataType,
  RerankModelDataType,
  STTModelDataType,
  AIModelDataType,
  TTSModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import { Readable } from 'node:stream';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { requestSpeech } from '../audio/speech';
import { getVectors } from '../embedding';
import { aiTranscriptions } from '../audio/transcriptions';
import { reRankRecall } from '../rerank';
import { createLLMResponse } from '../llm/request';

const logger = getLogger(LogCategories.MODULE.AI.MODEL);

// 1.38s 单声道 44.1kHz 32kbps MPEG-1 Layer 3 人声样例（由原 test.mp3 重编码压缩至 5.6KB），避免依赖磁盘文件与 Dockerfile 拷贝
const SAMPLE_TEST_MP3_BASE64 =
  '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';

/** 获取 STT 连通性测试使用的内置样例音频二进制（MPEG-1 Layer 3）。 */
export const getSampleTestAudioBuffer = (): Buffer => Buffer.from(SAMPLE_TEST_MP3_BASE64, 'base64');

/** 单次模型测试/探测统一使用的请求超时时间（60 秒）。 */
export const MODEL_TEST_TIMEOUT_MS = 60000;

/**
 * 通用模型连通性与执行测试服务。
 * 统一承载系统模型、团队模型、草稿模型以及指定具体渠道 (channelId) 的端到端连通性测试。
 * 支持 LLM、Embedding、TTS、STT、Rerank 五种模型类型：
 * - LLM: 发起一条包含简单 'hi' 的 stream 请求，不持久化 response 记录；
 * - Embedding: 对单条测试文本 'Hi' 生成向量；
 * - TTS: 取模型配置中的第一个音色合成 'Hi' 测试音频；
 * - STT: 读取内置样例 MP3 音频流进行转写测试；
 * - Rerank: 对单条文档进行重排打分测试。
 *
 * 超时通过 AbortSignal 传递到实际 HTTP 客户端终止底层连接。
 */
export const testModelConnection = async ({
  model,
  teamId,
  channelId,
  timeoutMs = MODEL_TEST_TIMEOUT_MS,
  signal: parentSignal,
  onRequestStart
}: {
  model: AIModelDataType;
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
  model: LLMModelDataType;
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
  model: EmbeddingModelDataType;
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
  model: TTSModelDataType;
  headers: Record<string, string>;
  timeoutMs: number;
  signal: AbortSignal;
  onRequestStart?: () => void;
}) => {
  const voice = model.config.voices[0]?.value;
  if (!voice) throw new UserError('TTS model test requires at least one voice');

  await requestSpeech({
    model,
    voice,
    input: 'Hi',
    speed: 1,
    timeoutMs,
    headers,
    signal,
    maxRetries: 0,
    onRequestStart
  });
};

/**
 * 测试语音识别 (STT) 模型连通性。
 * 将内置样例音频流发送转写，成功返回识别文本即判定为成功。
 */
const testSTTModel = async ({
  model,
  headers,
  timeoutMs,
  signal,
  onRequestStart
}: {
  model: STTModelDataType;
  headers: Record<string, string>;
  timeoutMs: number;
  signal: AbortSignal;
  onRequestStart?: () => void;
}) => {
  const { text } = await aiTranscriptions({
    model,
    fileStream: Readable.from(getSampleTestAudioBuffer()),
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
  model: RerankModelDataType;
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
