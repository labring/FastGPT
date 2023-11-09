import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { getPluginModuleDetail } from '@fastgpt/service/core/plugin/controller';
import { authPluginCrud } from '@fastgpt/service/support/permission/auth/plugin';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { id } = req.query as { id: string };
    await connectToDatabase();
    await authPluginCrud({ req, authToken: true, id, per: 'r' });

    jsonRes(res, {
      data: await getPluginModuleDetail({ id })
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
