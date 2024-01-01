import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { UserUpdateParams } from '@/types/user';
import { getAIApi, openaiBaseUrl } from '@fastgpt/service/core/ai/config';
import { connectToDatabase } from '@/service/mongo';

/* update user info */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { avatar, timezone, openaiAccount } = req.body as UserUpdateParams;

    const { userId } = await authCert({ req, authToken: true });

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
    await MongoUser.updateOne(
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
