// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { User } from '@/service/models/user';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { UserUpdateParams } from '@/types/user';
import { axiosConfig, getAIChatApi, openaiBaseUrl } from '@/service/lib/openai';

/* update user info */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { avatar, timezone, openaiAccount } = req.body as UserUpdateParams;

    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    // auth key
    if (openaiAccount?.key) {
      console.log('auth user openai key', openaiAccount?.key);
      const baseUrl = openaiAccount?.baseUrl || openaiBaseUrl;
      openaiAccount.baseUrl = baseUrl;

      const chatAPI = getAIChatApi(openaiAccount);

      const response = await chatAPI.createChatCompletion(
        {
          model: 'gpt-3.5-turbo',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        },
        {
          ...axiosConfig(openaiAccount)
        }
      );
      if (!response?.data?.choices?.[0]?.message?.content) {
        throw new Error(JSON.stringify(response?.data));
      }
    }

    // 更新对应的记录
    await User.updateOne(
      {
        _id: userId
      },
      {
        ...(avatar && { avatar }),
        ...(timezone && { timezone }),
        openaiAccount: openaiAccount?.key ? openaiAccount : null
      }
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
