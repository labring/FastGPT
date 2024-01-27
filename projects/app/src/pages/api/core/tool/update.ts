import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { UpdateOneToolParams } from '@fastgpt/global/core/tool/controller';
import { authToolCrud } from '@fastgpt/service/support/permission/auth/tool';
import { MongoTool } from '@fastgpt/service/core/tool/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { id, ...props } = req.body as UpdateOneToolParams;

    await authToolCrud({ req, authToken: true, id, per: 'owner' });

    jsonRes(res, {
      data: await MongoTool.findByIdAndUpdate(id, props)
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
