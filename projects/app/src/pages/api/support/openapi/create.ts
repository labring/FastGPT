import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { customAlphabet } from 'nanoid';
import type { EditApiKeyProps } from '@/global/support/openapi/api';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId, name, limit } = req.body as EditApiKeyProps;
    const { teamId, tmbId } = await authUserPer({ req, authToken: true, per: WritePermissionVal });

    const count = await MongoOpenApi.find({ tmbId, appId }).countDocuments();

    if (count >= 10) {
      throw new Error('最多 10 组 API 秘钥');
    }

    const nanoid = getNanoid(Math.floor(Math.random() * 14) + 52);
    const apiKey = `${global.systemEnv?.openapiPrefix || 'fastgpt'}-${nanoid}`;

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
