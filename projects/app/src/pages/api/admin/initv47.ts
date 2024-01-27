import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTool } from '@fastgpt/service/core/tool/schema';
import { connectionMongo } from '@fastgpt/service/common/mongo';

let success = 0;
/* pg 中的数据搬到 mongo dataset.datas 中，并做映射 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50 } = req.body as { limit: number };
    await authCert({ req, authRoot: true });
    await connectToDatabase();
    success = 0;

    await initToolCollection();

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

const initToolCollection = async () => {
  // 如果 tools 表没有数据的话，把现在的 plugins 表名改成 tools 表
  const total = await MongoTool.countDocuments();
  console.log(total);

  if (total > 0) return;

  const db = connectionMongo.connection.db;
  await db.collection('plugins').rename('tools', {
    dropTarget: true
  });
};
