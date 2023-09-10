import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, User } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';
import { PgTrainingTableName } from '@/constants/plugin';
import { OtherFileId } from '@/constants/kb';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    let { kbId, fileId } = req.query as {
      kbId: string;
      fileId: string;
    };

    if (!kbId) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    const thirtyMinutesAgo = new Date(
      Date.now() - (global.feConfigs?.exportLimitMinutes || 0) * 60 * 1000
    );

    // auth export times
    const authTimes = await User.findOne(
      {
        _id: userId,
        $or: [
          { 'limit.exportKbTime': { $exists: false } },
          { 'limit.exportKbTime': { $lte: thirtyMinutesAgo } }
        ]
      },
      '_id limit'
    );

    if (!authTimes) {
      const minutes = `${global.feConfigs?.exportLimitMinutes || 0} 分钟`;
      throw new Error(`上次导出未到 ${minutes}，每 ${minutes}仅可导出一次。`);
    }

    const where: any = [['kb_id', kbId], 'AND', ['user_id', userId]];
    // 从 pg 中获取所有数据
    const pgData = await PgClient.select<{ q: string; a: string; source: string }>(
      PgTrainingTableName,
      {
        where,
        fields: ['q', 'a', 'source'],
        order: [{ field: 'id', mode: 'DESC' }],
        limit: 1000000
      }
    );

    const data: [string, string, string][] = pgData.rows.map((item) => [
      item.q.replace(/\n/g, '\\n'),
      item.a.replace(/\n/g, '\\n'),
      item.source
    ]);

    // update export time
    await User.findByIdAndUpdate(userId, {
      'limit.exportKbTime': new Date()
    });

    jsonRes(res, {
      data
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '200mb'
    }
  }
};
