import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
import { updateOnePlugin } from '@fastgpt/service/core/plugin/controller';
import type { UpdatePluginParams } from '@fastgpt/global/core/plugin/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { userId } = await authUser({ req, authToken: true });
    const body = req.body as UpdatePluginParams;

    jsonRes(res, {
      data: await updateOnePlugin({ userId, ...body })
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
