import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes, responseWriteController } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { addLog } from '@fastgpt/service/common/system/log';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { findDatasetIdTreeByTopDatasetId } from '@fastgpt/service/core/dataset/controller';
import { limitCheck } from './checkExportLimit';
import { withNextCors } from '@fastgpt/service/common/middle/cors';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
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

    await limitCheck({
      userId,
      datasetId
    });

    const exportIds = await findDatasetIdTreeByTopDatasetId(datasetId);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8;');
    res.setHeader('Content-Disposition', 'attachment; filename=dataset.csv; ');

    const cursor = MongoDatasetData.find<{
      _id: string;
      collectionId: { name: string };
      q: string;
      a: string;
    }>(
      {
        datasetId: { $in: exportIds }
      },
      'q a'
    ).cursor();

    const write = responseWriteController({
      res,
      readStream: cursor
    });

    write(`\uFEFFindex,content`);

    cursor.on('data', (doc) => {
      const q = doc.q.replace(/"/g, '""') || '';
      const a = doc.a.replace(/"/g, '""') || '';

      write(`\n"${q}","${a}"`);
    });

    cursor.on('end', async () => {
      cursor.close();
      res.end();
      await MongoUser.findByIdAndUpdate(userId, {
        'limit.exportKbTime': new Date()
      });
    });

    cursor.on('error', (err) => {
      addLog.error(`export dataset error`, err);
      res.status(500);
      res.end();
    });
  } catch (err) {
    res.status(500);
    addLog.error(`export dataset error`, err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});

export const config = {
  api: {
    responseLimit: '100mb'
  }
};
