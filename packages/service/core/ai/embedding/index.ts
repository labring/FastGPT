import { type EmbeddingModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { isTeamModel } from '@fastgpt/global/core/ai/model/utils';
import { getAIApi, getModelOpenAIOptions } from '../config';
import { countPromptTokens, countPromptTokensBatch } from '../../../common/string/tiktoken/index';
import { EmbeddingTypeEnm } from '@fastgpt/global/core/ai/constants';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import z from 'zod';
import { truncateTextByFormattedTokenLimit } from './tokenLimit';
import {
  classifyEmbeddingError,
  createEmptyInputEmbeddingError,
  createInvalidResponseEmbeddingError,
  type EmbeddingErrorClassification,
  getEmbeddingRetryDirective,
  normalizeEmbeddingError
} from './error';

const logger = getLogger(LogCategories.MODULE.AI.EMBEDDING);

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
  if (inputs.length === 0 || inputs.some((item) => !item.input)) {
    return Promise.reject(createEmptyInputEmbeddingError());
  }

  // 关闭 OpenAI SDK 按状态码盲目重试，由本层在读取响应体分类后统一决定是否退避重试，
  // 避免 429 欠费在分类前已发送多次请求，也消除 SDK 与外层 retryFn 的重试放大。
  const { ai, requestMeta } = getAIApi({
    maxRetries: 0,
    ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
    ...(isTeamModel(model) ? { model } : {})
  });

  let chunkSize = Number(model.config.batchSize || 1);
  chunkSize = isNaN(chunkSize) ? 1 : chunkSize;

  const chunks: GetVectorInputItem[][] = [];
  for (let i = 0; i < inputs.length; i += chunkSize) {
    chunks.push(inputs.slice(i, i + chunkSize));
  }

  const lastFailure: {
    current?: {
      error: unknown;
      classification: EmbeddingErrorClassification;
      retryAfterMs?: number;
    };
  } = {};

  try {
    // Process chunks sequentially
    let totalTokens = 0;
    const allVectors: number[][] = [];

    for (const chunk of chunks) {
      const requestInput = chunk.map(getRequestInput);
      const inputTypes = Array.from(new Set(chunk.map((item) => item.type)));

      onRequestStart?.();
      const result = await retryFn(
        () =>
          ai.embeddings
            .create(
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
                maxRetries: timeoutMs === undefined ? undefined : 0,
                omitEmptyHeaders: true
              })
            )
            .then(async (res) => {
              if (!res?.data || !res?.data?.[0]?.embedding) {
                // 兼容部分供应商以 HTTP 200 返回结构化错误体（如 insufficient_quota），
                // 命中已知错误类别时按真实语义直接归类与止损，避免误当作空响应重复重试。
                const structuredError = getStructuredResponseError(res);
                if (structuredError) {
                  const structuredClassification = classifyEmbeddingError(structuredError, {
                    signal
                  });
                  if (structuredClassification.category !== 'unknown') {
                    return Promise.reject(
                      normalizeEmbeddingError(structuredError, {
                        signal,
                        classification: structuredClassification
                      })
                    );
                  }
                }
              }
              if (!res.data) {
                logger.error('Embedding API returned empty data', {
                  model: model.model,
                  inputTypes,
                  inputCount: chunk.length,
                  response: res
                });
                return Promise.reject(createInvalidResponseEmbeddingError());
              }
              if (!res?.data?.[0]?.embedding) {
                // @ts-expect-error provider error payload is not part of the embedding response type
                const msg = res.data?.err?.message || '';
                logger.error('Embedding API returned invalid embedding', {
                  model: model.model,
                  inputTypes,
                  inputCount: chunk.length,
                  response: res,
                  apiMessage: msg
                });
                return Promise.reject(
                  createInvalidResponseEmbeddingError(msg ? new Error(msg) : undefined)
                );
              }

              const [tokens, vectors] = await Promise.all([
                (async () => {
                  if (res.usage) return res.usage.total_tokens;

                  const tokens = await Promise.all(chunk.map(countInputTokens));
                  return tokens.reduce((sum, item) => sum + item, 0);
                })(),
                Promise.all(
                  res.data.map((item) =>
                    formatVectors(decodeEmbedding(item.embedding), model.config.normalization)
                  )
                )
              ]);

              return {
                tokens,
                vectors
              };
            }),
        {
          // SDK 已关闭重试，本层统一执行最多 2 次重试：优先遵循上游 x-should-retry / Retry-After 指令，
          // 无上游等待指示时按 500ms -> 1000ms 指数退避（总计最多 3 次请求）。
          attempts: timeoutMs === undefined ? 2 : 0,
          delayMs: (attempt) =>
            lastFailure.current?.retryAfterMs ?? Math.min(500 * 2 ** attempt, 8000),
          shouldRetry: (error) => {
            const classification = classifyEmbeddingError(error, { signal });
            if (!classification.retryable) {
              lastFailure.current = { error, classification };
              return false;
            }
            const directive = getEmbeddingRetryDirective(error);
            lastFailure.current = {
              error,
              classification,
              retryAfterMs: directive.retryAfterMs
            };
            return directive.shouldRetryInRequest;
          }
        }
      );

      totalTokens += result.tokens;
      allVectors.push(...result.vectors);
    }

    return {
      tokens: totalTokens,
      vectors: allVectors
    };
  } catch (error) {
    const cachedFailure = lastFailure.current;
    const classification =
      cachedFailure && cachedFailure.error === error
        ? cachedFailure.classification
        : classifyEmbeddingError(error, { signal });
    const inputTypes = Array.from(new Set(inputs.map((item) => item.type)));

    // 主动中断/探活超时取消不属于上游故障，降级为 warn 并保留原异常。
    if (classification.category === 'aborted') {
      logger.warn('Embedding request aborted', {
        model: model.model,
        inputTypes,
        inputCount: inputs.length
      });
      return Promise.reject(error);
    }

    logger.error('Embedding request failed', {
      model: model.model,
      inputTypes,
      inputCount: inputs.length,
      errorCategory: classification.category,
      retryable: classification.retryable,
      errorCode: classification.errorCode,
      upstreamStatus: classification.upstreamStatus,
      upstreamCode: classification.upstreamCode,
      upstreamType: classification.upstreamType,
      error
    });

    return Promise.reject(normalizeEmbeddingError(error, { signal, classification }));
  }
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
