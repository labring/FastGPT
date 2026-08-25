import { type EmbeddingModelItemType } from '@fastgpt/global/core/ai/model/type';
import { getAIApi, getAiproxyScopeHeaders } from '../config';
import { normalizeRelayNoChannelError } from '../channel';
import { assertModelActive } from '../model/cache';
import { countPromptTokens, countPromptTokensBatch } from '../../../common/string/tiktoken/index';
import { EmbeddingTypeEnm } from '@fastgpt/global/core/ai/constants';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import z from 'zod';
import { truncateTextByFormattedTokenLimit } from './tokenLimit';

const logger = getLogger(LogCategories.MODULE.AI.EMBEDDING);

type GetVectorsBaseProps = {
  modelData: EmbeddingModelItemType;
  type?: `${EmbeddingTypeEnm}`;
  headers?: Record<string, string>;
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

export async function getVectors({ modelData, inputs: rawInputs, type, headers }: GetVectorsProps) {
  // Disabled models must never be callable at runtime (F2-S3-TC06).
  assertModelActive(modelData);
  const validatedInputs = z
    .array(InputItemSchema)
    .parse(rawInputs)
    .map((item) => ({
      ...item,
      input: item.input.trim()
    }));
  if (validatedInputs.length === 0 || validatedInputs.some((item) => !item.input)) {
    return Promise.reject({
      code: 500,
      message: 'input is empty'
    });
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
                maxToken: modelData.maxToken,
                currentTokens
              })
            : item.input
      };
    })
  );
  if (inputs.length === 0 || inputs.some((item) => !item.input)) {
    return Promise.reject({
      code: 500,
      message: 'input is empty'
    });
  }

  const { ai, requestMeta } = getAIApi();

  let chunkSize = Number(modelData.batchSize || 1);
  chunkSize = isNaN(chunkSize) ? 1 : chunkSize;

  const chunks = [];
  for (let i = 0; i < inputs.length; i += chunkSize) {
    chunks.push(inputs.slice(i, i + chunkSize));
  }

  try {
    // Process chunks sequentially
    let totalTokens = 0;
    const allVectors: number[][] = [];

    for (const chunk of chunks) {
      const requestInput = chunk.map(getRequestInput);
      const inputTypes = Array.from(new Set(chunk.map((item) => item.type)));

      const result = await retryFn(() =>
        ai.embeddings
          .create(
            {
              // modelId is a platform-internal identifier — never send it upstream
              // (strict providers reject unknown top-level fields).
              model: modelData.model,
              input: requestInput,
              encoding_format: 'float',
              ...modelData.defaultConfig,
              ...(type === EmbeddingTypeEnm.db && modelData.dbConfig),
              ...(type === EmbeddingTypeEnm.query && modelData.queryConfig)
            } as any,
            {
              headers: {
                ...headers,
                // Relay scope is a security attribute (design §2.9) — it must win over
                // any caller-provided header (e.g. Aiproxy-Channel channel lock).
                ...getAiproxyScopeHeaders(modelData, requestMeta.baseUrl)
              }
            }
          )
          .then(async (res) => {
            if (!res.data) {
              logger.error('Embedding API returned empty data', {
                modelId: modelData.id,
                model: modelData.model,
                inputTypes,
                inputCount: chunk.length,
                response: res
              });
              return Promise.reject('Embedding API is not responding');
            }
            if (!res?.data?.[0]?.embedding) {
              // @ts-expect-error provider error payload is not part of the embedding response type
              const msg = res.data?.err?.message || '';
              logger.error('Embedding API returned invalid embedding', {
                modelId: modelData.id,
                model: modelData.model,
                inputTypes,
                inputCount: chunk.length,
                response: res,
                apiMessage: msg
              });
              return Promise.reject('Embedding API is not responding');
            }

            const [tokens, vectors] = await Promise.all([
              (async () => {
                if (res.usage) return res.usage.total_tokens;

                const tokens = await Promise.all(chunk.map(countInputTokens));
                return tokens.reduce((sum, item) => sum + item, 0);
              })(),
              Promise.all(
                res.data.map((item) =>
                  formatVectors(decodeEmbedding(item.embedding), modelData.normalization)
                )
              )
            ]);

            return {
              tokens,
              vectors
            };
          })
      );

      totalTokens += result.tokens;
      allVectors.push(...result.vectors);
    }

    return {
      tokens: totalTokens,
      vectors: allVectors
    };
  } catch (error) {
    logger.error('Embedding request failed', {
      modelId: modelData.id,
      model: modelData.model,
      inputTypes: Array.from(new Set(inputs.map((item) => item.type))),
      inputCount: inputs.length,
      error
    });

    // Relay "no available channel" (F2-S4-TC04) → ModelErrEnum.noAvailableChannel;
    // other errors pass through unchanged.
    return Promise.reject(normalizeRelayNoChannelError(error));
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
