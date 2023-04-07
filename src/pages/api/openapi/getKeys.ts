// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, OpenApi } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { UserOpenApiKey } from '@/types/openapi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('缺少登录凭证');
    }

    const userId = await authToken(authorization);

    await connectToDatabase();

    const findResponse = await OpenApi.find({ userId });

    // jus save four data
    const apiKeys = findResponse.map<UserOpenApiKey>((item) => {
      const key = item.apiKey;
      return {
        id: item._id,
        apiKey: `${key.substring(0, 2)}******${key.substring(key.length - 2)}`
      };
    });

    jsonRes(res, {
      data: apiKeys
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
