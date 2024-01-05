import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { UpdatePluginParams } from '@fastgpt/global/core/plugin/controller';
import { authPluginCrud } from '@fastgpt/service/support/permission/auth/plugin';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { id, ...props } = req.body as UpdatePluginParams;

    await authPluginCrud({ req, authToken: true, id, per: 'owner' });

    jsonRes(res, {
      data: await MongoPlugin.findByIdAndUpdate(id, props)
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
