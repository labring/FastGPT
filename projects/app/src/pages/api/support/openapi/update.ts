import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import type { EditApiKeyProps } from '@/global/support/openapi/api.d';
import { authOpenApiKeyCrud } from '@fastgpt/service/support/permission/auth/openapi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { _id, name, limit } = req.body as EditApiKeyProps & { _id: string };

    await authOpenApiKeyCrud({ req, authToken: true, id: _id, per: 'owner' });

    await MongoOpenApi.findByIdAndUpdate(_id, {
      ...(name && { name }),
      ...(limit && { limit })
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
