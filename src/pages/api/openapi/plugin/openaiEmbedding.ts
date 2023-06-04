import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser, getSystemOpenAiKey } from '@/service/utils/auth';
import { withNextCors } from '@/service/utils/tools';
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
      data: await openaiEmbedding({ userId, input, type })
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
  type = 'chat'
}: { userId: string } & Props) {
  const apiKey = getSystemOpenAiKey(type);

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
        ...axiosConfig(apiKey)
      }
    )
    .then((res) => ({
      tokenLen: res.data.usage.total_tokens || 0,
      vectors: res.data.data.map((item) => item.embedding)
    }));

  pushGenerateVectorBill({
    isPay: false,
    userId,
    text: input.join(''),
    tokenLen: result.tokenLen
  });

  return result.vectors;
}
