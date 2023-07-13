import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authBalanceByUid, authUser } from '@/service/utils/auth';
import { withNextCors } from '@/service/utils/tools';
import { getOpenAIApi, axiosConfig } from '@/service/ai/openai';
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
      throw new Error('缺少参数');
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

  // 获取 chatAPI
  const chatAPI = getOpenAIApi();

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
    .then((res) => {
      if (!res.data?.usage?.total_tokens) {
        // @ts-ignore
        return Promise.reject(res.data?.error?.message || 'Embedding Error');
      }
      return {
        tokenLen: res.data.usage.total_tokens || 0,
        vectors: res.data.data.map((item) => item.embedding)
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
