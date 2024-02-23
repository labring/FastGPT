import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { CreateOnePluginParams } from '@fastgpt/global/core/plugin/controller';
import { authUserNotVisitor } from '@fastgpt/service/support/permission/auth/user';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { teamId, tmbId } = await authUserNotVisitor({ req, authToken: true });
    const body = req.body as CreateOnePluginParams;

    const { _id } = await MongoPlugin.create({
      ...body,
      teamId,
      tmbId
    });

    jsonRes(res, {
      data: _id
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
