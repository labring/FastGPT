import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { withNextCors } from '@/service/utils/tools';
import { getApiKey } from '@/service/utils/auth';
import { getOpenAIApi } from '@/service/utils/chat/openai';
import { embeddingModel } from '@/constants/model';
import { axiosConfig } from '@/service/utils/tools';
import { pushGenerateVectorBill } from '@/service/events/pushBill';
import { ApiKeyType } from '@/service/utils/auth';

type Props = {
  input: string[];
  type?: ApiKeyType;
};
type Response = number[][];

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { userId } = await authUser({ req });
    let { input, type } = req.query as Props;

    if (!Array.isArray(input)) {
      throw new Error('缺少参数');
    }

    jsonRes<Response>(res, {
      data: await openaiEmbedding({ userId, input, mustPay: true, type })
    });
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});

export async function openaiEmbedding({
  userId,
  input,
  mustPay = false,
  type = 'chat'
}: { userId: string; mustPay?: boolean } & Props) {
  const { userOpenAiKey, systemAuthKey } = await getApiKey({
    model: 'gpt-3.5-turbo',
    userId,
    mustPay,
    type
  });

  // 获取 chatAPI
  const chatAPI = getOpenAIApi();

  // 把输入的内容转成向量
  const result = await chatAPI
    .createEmbedding(
      {
        model: embeddingModel,
        input
      },
      {
        timeout: 60000,
        ...axiosConfig(userOpenAiKey || systemAuthKey)
      }
    )
    .then((res) => ({
      tokenLen: res.data.usage.total_tokens || 0,
      vectors: res.data.data.map((item) => item.embedding)
    }));

  pushGenerateVectorBill({
    isPay: !userOpenAiKey,
    userId,
    text: input.join(''),
    tokenLen: result.tokenLen
  });

  return result.vectors;
}
