import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@fastgpt/support/user/auth';
import { PgClient } from '@/service/pg';
import { withNextCors } from '@/service/utils/tools';
import { PgDatasetTableName } from '@/constants/plugin';
import { connectToDatabase } from '@/service/mongo';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    let { dataId } = req.query as {
      dataId: string;
    };

    if (!dataId) {
      throw new Error('缺少参数');
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
