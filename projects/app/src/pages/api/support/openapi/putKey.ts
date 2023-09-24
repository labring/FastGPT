import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, OpenApi } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import type { EditApiKeyProps } from '@/api/support/openapi/index.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { _id, name, limit } = req.body as EditApiKeyProps & { _id: string };
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    await OpenApi.findOneAndUpdate(
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
