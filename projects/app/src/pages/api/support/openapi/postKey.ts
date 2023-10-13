// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoOpenApi } from '@fastgpt/support/openapi/schema';
import { authUser } from '@fastgpt/support/user/auth';
import { customAlphabet } from 'nanoid';
import type { EditApiKeyProps } from '@/global/support/api/openapiReq.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId, name, limit } = req.body as EditApiKeyProps;
    const { userId } = await authUser({ req, authToken: true });

    const count = await MongoOpenApi.find({ userId, appId }).countDocuments();

    if (count >= 10) {
      throw new Error('最多 10 组 API 秘钥');
    }

    const nanoid = customAlphabet(
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
      Math.floor(Math.random() * 14) + 24
    );
    const apiKey = `${global.systemEnv?.openapiPrefix || 'fastgpt'}-${nanoid()}`;

    await MongoOpenApi.create({
      userId,
      apiKey,
      appId,
      name,
      limit
    });

    jsonRes(res, {
      data: apiKey
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
