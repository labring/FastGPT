import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUsage } from '@fastgpt/service/support/wallet/usage/schema';
import { connectionMongo } from '@fastgpt/service/common/mongo';

/* pg 中的数据搬到 mongo dataset.datas 中，并做映射 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authCert({ req, authRoot: true });

    // 检查 usage 是否有记录
    const totalUsages = await MongoUsage.countDocuments();
    if (totalUsages === 0) {
      // 重命名 bills 集合成 usages
      await connectionMongo.connection.db.renameCollection('bills', 'usages', {
        // 强制
        dropTarget: true
      });
    }

    jsonRes(res, {
      message: 'success'
    });
  } catch (error) {
    console.log(error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}
