import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@fastgpt/service/support/user/auth';
import { PgClient } from '@/service/pg';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { PgDatasetTableName } from '@/constants/plugin';
import { connectToDatabase } from '@/service/mongo';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { dataId } = req.query as {
      dataId: string;
    };

    if (!dataId) {
      throw new Error('dataId is required');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await PgClient.delete(PgDatasetTableName, {
      where: [['user_id', userId], 'AND', ['id', dataId]]
    });

    jsonRes(res);
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});
