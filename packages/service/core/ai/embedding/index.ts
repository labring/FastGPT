import { getAIApi } from '../config';

export type GetVectorProps = {
  model: string;
  input: string;
};

// text to vector
export async function getVectorsByText({
  model = 'text-embedding-ada-002',
  input
}: GetVectorProps) {
  if (!input) {
    return Promise.reject({
      code: 500,
      message: 'input is empty'
    });
  }

  try {
    // 获取 chatAPI
    const ai = getAIApi();

    // 把输入的内容转成向量
    const result = await ai.embeddings
      .create({
        model,
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
          tokens: res.usage.total_tokens || 0,
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
    console.log(`当前向量维度为: ${vector.length}, 向量维度不能超过 1536, 已自动截取前 1536 维度`);
    return vector.slice(0, 1536);
  }
  let resultVector = vector;
  const vectorLen = vector.length;

  const zeroVector = new Array(1536 - vectorLen).fill(0);

  return resultVector.concat(zeroVector);
}
