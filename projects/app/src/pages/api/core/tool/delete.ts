import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoTool } from '@fastgpt/service/core/tool/schema';
import { authToolCrud } from '@fastgpt/service/support/permission/auth/tool';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { id } = req.query as { id: string };
    await connectToDatabase();
    await authToolCrud({ req, authToken: true, id, per: 'owner' });

    await MongoTool.findByIdAndRemove(id);

    jsonRes(res, {});
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
