// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { User } from '@/service/models/user';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { UserUpdateParams } from '@/types/user';
import { getAIApi, openaiBaseUrl } from '@fastgpt/core/ai/config';

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

      const ai = getAIApi(openaiAccount);

      const response = await ai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      });
      if (response?.choices?.[0]?.message?.content === undefined) {
        throw new Error('Key response is empty');
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
