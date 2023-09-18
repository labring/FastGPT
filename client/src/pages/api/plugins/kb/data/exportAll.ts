import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, User } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { PgDatasetTableName } from '@/constants/plugin';
import { findAllChildrenIds } from '../delete';
import QueryStream from 'pg-query-stream';
import Papa from 'papaparse';

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

    const thirtyMinutesAgo = new Date(
      Date.now() - (global.feConfigs?.limit?.exportLimitMinutes || 0) * 60 * 1000
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
      const minutes = `${global.feConfigs?.limit?.exportLimitMinutes || 0} 分钟`;
      throw new Error(`上次导出未到 ${minutes}，每 ${minutes}仅可导出一次。`);
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

      res.setHeader('Content-Disposition', 'attachment; filename=dataset.csv');
      res.setHeader('Content-Type', 'text/csv');

      res.write('index,content,source');

      // parse data every row
      stream.on('data', (row: { q: string; a: string; source?: string }) => {
        const csv = Papa.unparse([row], { header: false });
        res.write(`\n${csv}`);
      });
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
    bodyParser: {
      sizeLimit: '200mb'
    }
  }
};
