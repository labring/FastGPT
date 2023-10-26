import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
import { updateOneModule } from '@fastgpt/service/core/module/controller';
import type { UpdateNoduleParams } from '@fastgpt/global/core/module/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { userId } = await authUser({ req, authToken: true });
    const body = req.body as UpdateNoduleParams;

    jsonRes(res, {
      data: await updateOneModule({ userId, ...body })
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
