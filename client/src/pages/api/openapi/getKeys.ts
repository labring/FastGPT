// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, OpenApi } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { UserOpenApiKey } from '@/types/openapi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const findResponse = await OpenApi.find({ userId }).sort({ _id: -1 });

    // jus save four data
    const apiKeys = findResponse.map<UserOpenApiKey>(
      ({ _id, apiKey, createTime, lastUsedTime }) => {
        return {
          id: _id,
          apiKey: `******${apiKey.substring(apiKey.length - 4)}`,
          createTime,
          lastUsedTime
        };
      }
    );

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
