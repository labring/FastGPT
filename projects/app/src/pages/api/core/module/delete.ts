import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
import { deleteOneModule } from '@fastgpt/service/core/module/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { id } = req.query as { id: string };
    await connectToDatabase();
    const { userId } = await authUser({ req, authToken: true });

    jsonRes(res, {
      data: await deleteOneModule({ id, userId })
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
