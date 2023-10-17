import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoOpenApi } from '@fastgpt/support/openapi/schema';
import { authUser } from '@fastgpt/support/user/auth';
import type { EditApiKeyProps } from '@/global/support/api/openapiReq.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { _id, name, limit } = req.body as EditApiKeyProps & { _id: string };
    const { userId } = await authUser({ req, authToken: true });

    await MongoOpenApi.findOneAndUpdate(
      {
        _id,
        userId
      },
      {
        ...(name && { name }),
        ...(limit && { limit })
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
