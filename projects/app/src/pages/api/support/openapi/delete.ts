// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { authOpenApiKeyCrud } from '@fastgpt/service/support/permission/auth/openapi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { id } = req.query as { id: string };

    if (!id) {
      throw new Error('缺少参数');
    }

    await authOpenApiKeyCrud({ req, authToken: true, id, per: 'owner' });

    await MongoOpenApi.findOneAndRemove({ _id: id });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
