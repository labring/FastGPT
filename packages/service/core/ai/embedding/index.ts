import { type EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { getAIApi } from '../config';
import { countPromptTokens } from '../../../common/string/tiktoken/index';
import { EmbeddingTypeEnm } from '@fastgpt/global/core/ai/constants';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { VECTOR_DIMENSION } from '../../../common/vectorDB/constants';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.AI.EMBEDDING);

type GetVectorProps = {
  model: EmbeddingModelItemType;
  input: string[] | string;
  type?: `${EmbeddingTypeEnm}`;
  headers?: Record<string, string>;
};

// text to vector
export async function getVectorsByText({ model, input, type, headers }: GetVectorProps) {
  if (!input) {
    return Promise.reject({
      code: 500,
      message: 'input is empty'
    });
  }
  const ai = getAIApi();

  const formatInput = Array.isArray(input) ? input : [input];

  let chunkSize = Number(model.batchSize || 1);
  chunkSize = isNaN(chunkSize) ? 1 : chunkSize;

  const chunks = [];
  for (let i = 0; i < formatInput.length; i += chunkSize) {
    chunks.push(formatInput.slice(i, i + chunkSize));
  }

  try {
    // Process chunks sequentially
    let totalTokens = 0;
    const allVectors: number[][] = [];

    for (const chunk of chunks) {
      // input text to vector
      const result = await retryFn(() =>
        ai.embeddings
          .create(
            {
              ...model.defaultConfig,
              ...(type === EmbeddingTypeEnm.db && model.dbConfig),
              ...(type === EmbeddingTypeEnm.query && model.queryConfig),
              model: model.model,
              input: chunk
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
          )
          .then(async (res) => {
            if (!res.data) {
              logger.error('Embedding API returned empty data', {
                model: model.model,
                inputLength: chunk.length,
                response: res
              });
              return Promise.reject('Embedding API is not responding');
            }
            if (!res?.data?.[0]?.embedding) {
              // @ts-ignore
              const msg = res.data?.err?.message || '';
              logger.error('Embedding API returned invalid embedding', {
                model: model.model,
                inputLength: chunk.length,
                response: res,
                apiMessage: msg
              });
              return Promise.reject('Embedding API is not responding');
            }

            const [tokens, vectors] = await Promise.all([
              (async () => {
                if (res.usage) return res.usage.total_tokens;

                const tokens = await Promise.all(chunk.map((item) => countPromptTokens(item)));
                return tokens.reduce((sum, item) => sum + item, 0);
              })(),
              Promise.all(
                res.data.map((item) => formatVectors(item.embedding, model.normalization))
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
      inputLengths: formatInput.map((item) => item.length),
      error
    });

    return Promise.reject(error);
  }
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
  if (vector.length > VECTOR_DIMENSION) {
    logger.warn('Embedding vector dimension exceeded, truncating', {
      vectorLength: vector.length,
      limit: VECTOR_DIMENSION
    });
    return normalizationVector(vector.slice(0, VECTOR_DIMENSION));
  } else if (vector.length < VECTOR_DIMENSION) {
    const vectorLen = vector.length;

    const zeroVector = new Array(VECTOR_DIMENSION - vectorLen).fill(0);

    vector = vector.concat(zeroVector);
  }

  if (normalization) {
    return normalizationVector(vector);
  }

  return vector;
}
