import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { updateOnePlugin } from '@fastgpt/service/core/plugin/controller';
import type { UpdatePluginParams } from '@fastgpt/global/core/plugin/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { userId } = await authCert({ req, authToken: true });
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
