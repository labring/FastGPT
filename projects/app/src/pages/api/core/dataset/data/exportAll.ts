import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { PgDatasetTableName } from '@fastgpt/global/core/dataset/constant';
import { findAllChildrenIds } from '../delete';
import QueryStream from 'pg-query-stream';
import { PgClient } from '@fastgpt/service/common/pg';
import { addLog } from '@fastgpt/service/common/mongo/controller';
import { responseWriteController } from '@fastgpt/service/common/response';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    let { datasetId } = req.query as {
      datasetId: string;
    };

    if (!datasetId || !global.pgClient) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const { userId } = await authDataset({ req, authToken: true, datasetId, per: 'w' });

    const exportIds = [datasetId, ...(await findAllChildrenIds(datasetId))];

    const limitMinutesAgo = new Date(
      Date.now() - (global.feConfigs?.limit?.exportLimitMinutes || 0) * 60 * 1000
    );

    // auth export times
    const authTimes = await MongoUser.findOne(
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
      `SELECT count(id) FROM ${PgDatasetTableName} where dataset_id IN (${exportIds
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
      if (!client) return;

      // create pg select stream
      const query = new QueryStream(
        `SELECT q, a FROM ${PgDatasetTableName} where dataset_id IN (${exportIds
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

      write('index,content');

      // parse data every row
      stream.on('data', ({ q, a }: { q: string; a: string }) => {
        if (res.closed) {
          return stream.destroy();
        }
        q = q.replace(/"/g, '""');
        a = a.replace(/"/g, '""');
        // source = source?.replace(/"/g, '""');

        write(`\n"${q}","${a || ''}"`);
      });
      // finish
      stream.on('end', async () => {
        try {
          // update export time
          await MongoUser.findByIdAndUpdate(userId, {
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
