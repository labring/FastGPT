import { type EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { getAIApi } from '../config';
import { countPromptTokens } from '../../../common/string/tiktoken/index';
import { EmbeddingTypeEnm } from '@fastgpt/global/core/ai/constants';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import z from 'zod';

const logger = getLogger(LogCategories.MODULE.AI.EMBEDDING);

type GetVectorsBaseProps = {
  model: EmbeddingModelItemType;
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

export async function getVectors({ model, inputs: rawInputs, type, headers }: GetVectorsProps) {
  const inputs = z
    .array(InputItemSchema)
    .parse(rawInputs)
    .map((item) => ({
      ...item,
      input: item.input.trim()
    }));
  if (inputs.length === 0 || inputs.some((item) => !item.input)) {
    return Promise.reject({
      code: 500,
      message: 'input is empty'
    });
  }

  const { ai } = getAIApi();

  let chunkSize = Number(model.batchSize || 1);
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
              model: model.model,
              input: requestInput,
              encoding_format: 'float',
              ...model.defaultConfig,
              ...(type === EmbeddingTypeEnm.db && model.dbConfig),
              ...(type === EmbeddingTypeEnm.query && model.queryConfig)
            } as any,
            model.requestUrl
              ? {
                  path: model.requestUrl,
                  headers: {
                    ...(model.requestAuth ? { Authorization: `Bearer ${model.requestAuth}` } : {}),
                    ...headers
                  }
                }
              : { headers }
          )
          .then(async (res) => {
            if (!res.data) {
              logger.error('Embedding API returned empty data', {
                model: model.model,
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
                model: model.model,
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
                  formatVectors(decodeEmbedding(item.embedding), model.normalization)
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
      model: model.model,
      inputTypes: Array.from(new Set(inputs.map((item) => item.type))),
      inputCount: inputs.length,
      error
    });

    return Promise.reject(error);
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
