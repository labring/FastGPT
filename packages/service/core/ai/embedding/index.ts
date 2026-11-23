import { type EmbeddingModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { isTeamModel } from '@fastgpt/global/core/ai/model/utils';
import { getAIApi, getModelOpenAIOptions } from '../config';
import { countPromptTokens, countPromptTokensBatch } from '../../../common/string/tiktoken/index';
import { EmbeddingTypeEnm } from '@fastgpt/global/core/ai/constants';
import { delay } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import z from 'zod';
import { truncateTextByFormattedTokenLimit } from './tokenLimit';
import {
  createEmptyInputEmbeddingError,
  createInvalidResponseEmbeddingError,
  inspectEmbeddingFailure,
  normalizeEmbeddingFailure,
  pickEmbeddingRetryHeaders
} from './error';

const logger = getLogger(LogCategories.MODULE.AI.EMBEDDING);
const MAX_EMBEDDING_RETRY_WAIT_MS = 10_000;

type GetVectorsBaseProps = {
  model: EmbeddingModelDataType;
  type?: `${EmbeddingTypeEnm}`;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  onRequestStart?: () => void;
};

const InputItemSchema = z.object({
  type: z.enum(['text', 'image']),
  input: z.string()
});
type GetVectorInputItem = z.infer<typeof InputItemSchema>;

export type GetVectorsProps = GetVectorsBaseProps & {
  inputs: GetVectorInputItem[];
};

const getRequestInput = (input: GetVectorInputItem) => {
  if (input.type === 'image') {
    return {
      type: 'image_url',
      image_url: {
        url: input.input
      }
    };
  }

  return input.input;
};

const countInputTokens = async (input: GetVectorInputItem) => {
  if (input.type === 'image') return 1;
  return countPromptTokens(input.input);
};

const getStructuredResponseError = (res: unknown): unknown => {
  if (typeof res !== 'object' || res === null) return undefined;
  const record = res as { error?: unknown; data?: unknown };
  if (record.error) return record;
  if (typeof record.data === 'object' && record.data !== null && 'err' in record.data) {
    const err = (record.data as { err?: unknown }).err;
    if (err) return { error: err };
  }
  return undefined;
};

const unwrapEmbeddingResponse = async <T>(
  request: Promise<T> & { withResponse?: () => Promise<{ data: T; response?: Response }> }
): Promise<{ data: T; response?: Response }> => {
  if (typeof request?.withResponse === 'function') {
    return await request.withResponse();
  }
  return { data: await request };
};

export async function getVectors({
  model,
  inputs: rawInputs,
  type,
  headers,
  timeoutMs,
  signal,
  onRequestStart
}: GetVectorsProps) {
  const validatedInputs = z
    .array(InputItemSchema)
    .parse(rawInputs)
    .map((item) => ({
      ...item,
      input: item.input.trim()
    }));
  if (validatedInputs.length === 0 || validatedInputs.some((item) => !item.input)) {
    return Promise.reject(createEmptyInputEmbeddingError());
  }
  const textInputs = validatedInputs
    .filter((item) => item.type === 'text')
    .map((item) => item.input);
  const textTokenCounts = textInputs.length > 0 ? await countPromptTokensBatch(textInputs) : [];
  let textIndex = 0;
  const inputs = await Promise.all(
    validatedInputs.map(async (item) => {
      const currentTokens = item.type === 'text' ? textTokenCounts[textIndex++] : undefined;

      // getVectors 是所有 embedding 请求的最后入口。这里仅对 text 做单条截断兜底，
      // 不做拆分；知识库入库这类需要保留完整内容的场景，应在上游先拆成多条 index。
      return {
        ...item,
        input:
          item.type === 'text'
            ? await truncateTextByFormattedTokenLimit({
                text: item.input,
                maxToken: model.config.maxToken,
                currentTokens
              })
            : item.input
      };
    })
  );
  if (inputs.some((item) => !item.input)) {
    return Promise.reject(createEmptyInputEmbeddingError());
  }

  const { ai, requestMeta } = getAIApi({
    ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
    ...(isTeamModel(model) ? { model } : {})
  });

  let chunkSize = Number(model.config.batchSize || 1);
  chunkSize = isNaN(chunkSize) ? 1 : chunkSize;

  const chunks: GetVectorInputItem[][] = [];
  for (let i = 0; i < inputs.length; i += chunkSize) {
    chunks.push(inputs.slice(i, i + chunkSize));
  }

  // 模型探活传入超时值，每次探活尝试只发一次请求，由探活模块统一控制尝试次数。
  const maxRetries = timeoutMs === undefined ? 2 : 0;
  let remainingRetryWaitMs = MAX_EMBEDDING_RETRY_WAIT_MS;
  let failure: ReturnType<typeof inspectEmbeddingFailure> | undefined;
  let totalTokens = 0;
  const allVectors: number[][] = [];

  try {
    // 串行处理批次，保持返回向量与输入顺序一致，各批次共用退避预算。
    processChunks: for (const chunk of chunks) {
      const requestInput = chunk.map(getRequestInput);
      const inputTypes = Array.from(new Set(chunk.map((item) => item.type)));
      onRequestStart?.();

      const requestChunk = async () => {
        // 关闭 SDK 重试，收到上游响应后才能区分欠费和普通限流。
        const { data: res, response } = await unwrapEmbeddingResponse(
          ai.embeddings.create(
            {
              model: model.model,
              input: requestInput,
              encoding_format: 'float',
              ...model.config.defaultConfig,
              ...(type === EmbeddingTypeEnm.db && model.config.dbConfig),
              ...(type === EmbeddingTypeEnm.query && model.config.queryConfig)
            } as any,
            getModelOpenAIOptions({
              model,
              baseUrl: requestMeta?.baseUrl,
              headers,
              signal,
              maxRetries: 0,
              omitEmptyHeaders: true
            })
          )
        );

        // 校验向量数据完整性，并将 2xx 错误体交给同一套分类与重试流程。
        const data = res?.data;
        if (!Array.isArray(data) || data.length === 0 || data.some((item) => !item?.embedding)) {
          const structuredError = !data?.[0]?.embedding
            ? getStructuredResponseError(res)
            : undefined;
          if (structuredError) {
            // 仅携带退避白名单响应头，避免把无关上游头带入异常链。
            const retryHeaders = pickEmbeddingRetryHeaders(response?.headers);
            const inspected = inspectEmbeddingFailure(
              retryHeaders && typeof structuredError === 'object'
                ? { ...structuredError, headers: retryHeaders }
                : structuredError,
              signal
            );
            if (inspected.classification.category !== 'unknown') return { failure: inspected };
          }

          // @ts-expect-error provider error payload is not part of the embedding response type
          const apiMessage = data?.err?.message || '';
          logger.error(
            data ? 'Embedding API returned invalid embedding' : 'Embedding API returned empty data',
            {
              model: model.model,
              inputTypes,
              inputCount: chunk.length,
              response: res,
              ...(data ? { apiMessage } : {})
            }
          );
          throw createInvalidResponseEmbeddingError(apiMessage ? new Error(apiMessage) : undefined);
        }

        // 供应商缺少 usage 时按当前批次回退计量，同时把返回向量转换为统一格式。
        const [tokens, vectors] = await Promise.all([
          (async () => {
            if (res.usage) return res.usage.total_tokens;

            const tokens = await Promise.all(chunk.map(countInputTokens));
            return tokens.reduce((sum, item) => sum + item, 0);
          })(),
          Promise.all(
            data.map((item) =>
              formatVectors(decodeEmbedding(item.embedding), model.config.normalization)
            )
          )
        ]);
        return { tokens, vectors };
      };

      for (let attempt = 0; ; attempt++) {
        const result = await requestChunk().catch((error: unknown) => ({
          failure: inspectEmbeddingFailure(error, signal)
        }));
        if (!result.failure) {
          totalTokens += result.tokens;
          allVectors.push(...result.vectors);
          break;
        }

        const { retryDirective } = result.failure;
        const waitMs = retryDirective?.retryAfterMs ?? 500 * 2 ** attempt;
        // 预算覆盖本次 getVectors 的所有批次。停止时保留上游等待时间，供训练队列接续。
        if (
          attempt >= maxRetries ||
          !retryDirective?.allowsRequestRetry ||
          waitMs > remainingRetryWaitMs
        ) {
          failure = result.failure;
          break processChunks;
        }
        remainingRetryWaitMs -= waitMs;
        if (waitMs > 0) await delay(waitMs);
      }
    }
  } catch (error) {
    failure = inspectEmbeddingFailure(error, signal);
  }

  if (!failure) return { tokens: totalTokens, vectors: allVectors };

  const { error, classification, retryDirective } = failure;
  const inputTypes = Array.from(new Set(inputs.map((item) => item.type)));

  // 主动取消由调用方控制，降级为告警并原样抛出，供上层继续识别取消。
  if (classification.category === 'aborted') {
    logger.warn('Embedding request aborted', {
      model: model.model,
      inputTypes,
      inputCount: inputs.length
    });
    throw error;
  }

  logger.error('Embedding request failed', {
    model: model.model,
    inputTypes,
    inputCount: inputs.length,
    errorCategory: classification.category,
    retryable: classification.retryable,
    errorCode: classification.errorCode,
    ...(retryDirective?.retryAfterMs !== undefined
      ? { retryAfterMs: retryDirective.retryAfterMs }
      : {}),
    upstreamStatus: classification.upstreamStatus,
    upstreamCode: classification.upstreamCode,
    upstreamType: classification.upstreamType,
    error
  });

  throw normalizeEmbeddingFailure(failure);
}

export function decodeEmbedding(embedding: number[] | string): number[] {
  if (typeof embedding === 'string') {
    // base64-encoded IEEE 754 little-endian float32 array
    const buf = Buffer.from(embedding, 'base64');
    const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    return Array.from(floats);
  }
  return embedding;
}

export function formatVectors(vector: number[], normalization = false) {
  // normalization processing
  function normalizationVector(vector: number[]) {
    // Calculate the Euclidean norm (L2 norm)
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) {
      return vector;
    }
    // Normalize the vector by dividing each component by the norm
    return vector.map((val) => val / norm);
  }

  // 超过上限，截断，并强制归一化
  if (vector.length > 1536) {
    logger.warn('Embedding vector dimension exceeded, truncating to 1536', {
      vectorLength: vector.length,
      limit: 1536
    });
    return normalizationVector(vector.slice(0, 1536));
  } else if (vector.length < 1536) {
    const vectorLen = vector.length;

    const zeroVector = new Array(1536 - vectorLen).fill(0);

    vector = vector.concat(zeroVector);
  }

  if (normalization) {
    return normalizationVector(vector);
  }

  return vector;
}
