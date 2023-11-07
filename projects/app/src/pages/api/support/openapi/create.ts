// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { customAlphabet } from 'nanoid';
import type { EditApiKeyProps } from '@/global/support/openapi/api';
import { authUserNotVisitor } from '@fastgpt/service/support/permission/auth/user';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId, name, limit } = req.body as EditApiKeyProps;
    const { teamId, tmbId } = await authUserNotVisitor({ req, authToken: true });

    const count = await MongoOpenApi.find({ tmbId, appId }).countDocuments();

    if (count >= 10) {
      throw new Error('最多 10 组 API 秘钥');
    }

    const nanoid = customAlphabet(
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
      Math.floor(Math.random() * 14) + 24
    );
    const apiKey = `${global.systemEnv?.openapiPrefix || 'fastgpt'}-${nanoid()}`;

    await MongoOpenApi.create({
      teamId,
      tmbId,
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
