import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, User } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { PgDatasetTableName } from '@/constants/plugin';
import { findAllChildrenIds } from '../delete';
import QueryStream from 'pg-query-stream';
import { PgClient } from '@/service/pg';
import { addLog } from '@/service/utils/tools';
import { responseWriteController } from '@/service/common/stream';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    let { kbId } = req.query as {
      kbId: string;
    };

    if (!kbId || !global.pgClient) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    const exportIds = [kbId, ...(await findAllChildrenIds(kbId))];

    const limitMinutesAgo = new Date(
      Date.now() - (global.feConfigs?.limit?.exportLimitMinutes || 0) * 60 * 1000
    );

    // auth export times
    const authTimes = await User.findOne(
      {
        _id: userId,
        $or: [
          { 'limit.exportKbTime': { $exists: false } },
          { 'limit.exportKbTime': { $lte: limitMinutesAgo } }
        ]
      },
      '_id limit'
    );

    if (!authTimes) {
      const minutes = `${global.feConfigs?.limit?.exportLimitMinutes || 0} 分钟`;
      throw new Error(`上次导出未到 ${minutes}，每 ${minutes}仅可导出一次。`);
    }

    const { rows } = await PgClient.query(
      `SELECT count(id) FROM ${PgDatasetTableName} where user_id='${userId}' AND kb_id IN (${exportIds
        .map((id) => `'${id}'`)
        .join(',')})`
    );
    const total = rows?.[0]?.count || 0;

    addLog.info(`export datasets: ${userId}`, { total });

    if (total > 100000) {
      throw new Error('数据量超出 10 万，无法导出');
    }

    // connect pg
    global.pgClient.connect((err, client, done) => {
      if (err) {
        console.error(err);
        res.end('Error connecting to database');
        return;
      }

      // create pg select stream
      const query = new QueryStream(
        `SELECT q, a, source FROM ${PgDatasetTableName} where user_id='${userId}' AND kb_id IN (${exportIds
          .map((id) => `'${id}'`)
          .join(',')})`
      );
      const stream = client.query(query);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=dataset.csv; ');

      const write = responseWriteController({
        res,
        readStream: stream
      });

      write('index,content,source');

      // parse data every row
      stream.on('data', ({ q, a, source }: { q: string; a: string; source?: string }) => {
        if (res.closed) {
          return stream.destroy();
        }
        write(`\n"${q}","${a || ''}","${source || ''}"`);
      });
      // finish
      stream.on('end', async () => {
        try {
          // update export time
          await User.findByIdAndUpdate(userId, {
            'limit.exportKbTime': new Date()
          });
        } catch (error) {}

        // close response
        done();
        res.end();
      });
      stream.on('error', (err) => {
        done(err);
        res.end('Error exporting data');
      });
    });
  } catch (err) {
    res.status(500);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export const config = {
  api: {
    responseLimit: '100mb'
  }
};
