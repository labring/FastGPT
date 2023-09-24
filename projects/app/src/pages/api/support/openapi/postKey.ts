// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, OpenApi } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { customAlphabet } from 'nanoid';
import type { EditApiKeyProps } from '@/api/support/openapi/index.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { appId, name, limit } = req.body as EditApiKeyProps;
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const count = await OpenApi.find({ userId, appId }).countDocuments();

    if (count >= 10) {
      throw new Error('最多 10 组 API 秘钥');
    }

    const nanoid = customAlphabet(
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
      Math.floor(Math.random() * 14) + 24
    );
    const apiKey = `${global.systemEnv?.openapiPrefix || 'fastgpt'}-${nanoid()}`;

    await OpenApi.create({
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
