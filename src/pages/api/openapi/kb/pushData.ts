import type { NextApiRequest, NextApiResponse } from 'next';
import type { KbDataItemType } from '@/types/plugin';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/auth';
import { generateVector } from '@/service/events/generateVector';
import { PgClient } from '@/service/pg';
import { authKb } from '@/service/utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const {
      kbId,
      data,
      formatLineBreak = true
    } = req.body as {
      kbId: string;
      formatLineBreak?: boolean;
      data: { a: KbDataItemType['a']; q: KbDataItemType['q'] }[];
    };

    if (!kbId || !Array.isArray(data)) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(req);

    await connectToDatabase();

    await authKb({
      userId,
      kbId
    });

    // 过滤重复的内容
    const searchRes = await Promise.allSettled(
      data.map(async ({ q, a = '' }) => {
        if (!q) {
          return Promise.reject('q为空');
        }

        if (formatLineBreak) {
          q = q.replace(/\\n/g, '\n');
          a = a.replace(/\\n/g, '\n');
        }

        // Exactly the same data, not push
        try {
          const count = await PgClient.count('modelData', {
            where: [['user_id', userId], 'AND', ['kb_id', kbId], 'AND', ['q', q], 'AND', ['a', a]]
          });
          if (count > 0) {
            return Promise.reject('已经存在');
          }
        } catch (error) {
          error;
        }
        return Promise.resolve({
          q,
          a
        });
      })
    );
    const filterData = searchRes
      .filter((item) => item.status === 'fulfilled')
      .map<{ q: string; a: string }>((item: any) => item.value);

    // 插入记录
    const insertRes = await PgClient.insert('modelData', {
      values: filterData.map((item) => [
        { key: 'user_id', value: userId },
        { key: 'kb_id', value: kbId },
        { key: 'q', value: item.q },
        { key: 'a', value: item.a },
        { key: 'status', value: 'waiting' }
      ])
    });

    generateVector();

    jsonRes(res, {
      message: `共插入 ${insertRes.rowCount} 条数据`,
      data: insertRes.rowCount
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
