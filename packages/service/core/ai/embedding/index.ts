import { VectorModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getAIApi } from '../config';

type GetVectorProps = {
  model: VectorModelItemType;
  input: string;
};

// text to vector
export async function getVectorsByText({ model, input }: GetVectorProps) {
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
      .create({
        ...model.defaultConfig,
        model: model.model,
        input: [input]
      })
      .then(async (res) => {
        if (!res.data) {
          return Promise.reject('Embedding API 404');
        }
        if (!res?.data?.[0]?.embedding) {
          console.log(res);
          // @ts-ignore
          return Promise.reject(res.data?.err?.message || 'Embedding API Error');
        }

        return {
          charsLength: input.length,
          vectors: await Promise.all(res.data.map((item) => unityDimensional(item.embedding)))
        };
      });

    return result;
  } catch (error) {
    console.log(`Embedding Error`, error);

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
