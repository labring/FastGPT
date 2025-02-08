import { EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getAIApi } from '../config';
import { countPromptTokens } from '../../../common/string/tiktoken/index';
import { EmbeddingTypeEnm } from '@fastgpt/global/core/ai/constants';
import { addLog } from '../../../common/system/log';

type GetVectorProps = {
  model: EmbeddingModelItemType;
  input: string;
  type?: `${EmbeddingTypeEnm}`;
};

// text to vector
export async function getVectorsByText({ model, input, type }: GetVectorProps) {
  if (!input) {
    return Promise.reject({
      code: 500,
      message: 'input is empty'
    });
  }

  try {
    const ai = getAIApi();

    // input text to vector
    const result = await ai.embeddings
      .create(
        {
          ...model.defaultConfig,
          ...(type === EmbeddingTypeEnm.db && model.dbConfig),
          ...(type === EmbeddingTypeEnm.query && model.queryConfig),
          model: model.model,
          input: [input]
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
      )
      .then(async (res) => {
        if (!res.data) {
          addLog.error('Embedding API is not responding', res);
          return Promise.reject('Embedding API is not responding');
        }
        if (!res?.data?.[0]?.embedding) {
          console.log(res);
          // @ts-ignore
          return Promise.reject(res.data?.err?.message || 'Embedding API Error');
        }

        const [tokens, vectors] = await Promise.all([
          countPromptTokens(input),
          Promise.all(
            res.data
              .map((item) => unityDimensional(item.embedding))
              .map((item) => {
                if (model.normalization) return normalization(item);
                return item;
              })
          )
        ]);

        return {
          tokens,
          vectors
        };
      });

    return result;
  } catch (error) {
    addLog.error(`Embedding Error`, error);

    return Promise.reject(error);
  }
}

function unityDimensional(vector: number[]) {
  if (vector.length > 1536) {
    console.log(
      `The current vector dimension is ${vector.length}, and the vector dimension cannot exceed 1536. The first 1536 dimensions are automatically captured`
    );
    return vector.slice(0, 1536);
  }
  let resultVector = vector;
  const vectorLen = vector.length;

  const zeroVector = new Array(1536 - vectorLen).fill(0);

  return resultVector.concat(zeroVector);
}
// normalization processing
function normalization(vector: number[]) {
  if (vector.some((item) => item > 1)) {
    // Calculate the Euclidean norm (L2 norm)
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));

    // Normalize the vector by dividing each component by the norm
    return vector.map((val) => val / norm);
  }

  return vector;
}
