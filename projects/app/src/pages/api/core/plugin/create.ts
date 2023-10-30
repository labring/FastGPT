import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
import { createOnePlugin } from '@fastgpt/service/core/plugin/controller';
import type { CreateOnePluginParams } from '@fastgpt/global/core/plugin/controller';
import { defaultModules } from '@fastgpt/global/core/plugin/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { userId } = await authUser({ req, authToken: true });
    const body = req.body as CreateOnePluginParams;

    jsonRes(res, {
      data: await createOnePlugin({ userId, modules: defaultModules, ...body })
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
