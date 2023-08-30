import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authBalanceByUid, authUser } from '@/service/utils/auth';
import { withNextCors } from '@/service/utils/tools';
import { getAIChatApi, axiosConfig } from '@/service/ai/openai';
import { pushGenerateVectorBill } from '@/service/events/pushBill';

type Props = {
  model: string;
  input: string[];
};
type Response = {
  tokenLen: number;
  vectors: number[][];
};

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { userId } = await authUser({ req });
    let { input, model } = req.query as Props;

    if (!Array.isArray(input)) {
      throw new Error('Missing parameters');
    }

    jsonRes<Response>(res, {
      data: await getVector({ userId, input, model })
    });
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});

export async function getVector({
  model = 'text-embedding-ada-002',
  userId,
  input
}: { userId?: string } & Props) {
  userId && (await authBalanceByUid(userId));

  for (let i = 0; i < input.length; i++) {
    if (!input[i]) {
      return Promise.reject({
        code: 500,
        message: 'The input content of the vector generation module is empty'
      });
    }
  }

  // 获取 chatAPI
  const chatAPI = getAIChatApi();

  // 把输入的内容转成向量
  const result = await chatAPI
    .createEmbedding(
      {
        model,
        input
      },
      {
        timeout: 60000,
        ...axiosConfig()
      }
    )
    .then(async (res) => {
      if (!res.data?.data?.[0]?.embedding) {
        // @ts-ignore
        return Promise.reject(res.data?.error?.message || 'Embedding Error');
      }
      return {
        tokenLen: res.data.usage.total_tokens || 0,
        vectors: await Promise.all(res.data.data.map((item) => unityDimensional(item.embedding)))
      };
    });

  userId &&
    pushGenerateVectorBill({
      userId,
      tokenLen: result.tokenLen,
      model
    });

  return result;
}

function unityDimensional(vector: number[]) {
  if (vector.length > 1536) return Promise.reject('Vector dimensions cannot exceed 1536');
  let resultVector = vector;
  const vectorLen = vector.length;

  const zeroVector = new Array(1536 - vectorLen).fill(0);

  return resultVector.concat(zeroVector);
}
