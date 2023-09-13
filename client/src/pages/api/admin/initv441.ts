import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { connectToDatabase } from '@/service/mongo';
import mongoose from 'mongoose';
import { PgClient } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authUser({ req, authRoot: true });

    const data = await mongoose.connection.db
      .collection('dataset.files')
      .updateMany({}, { $set: { 'metadata.datasetUsed': true } });

    // update pg data
    const pg = await PgClient.query(`UPDATE ${PgDatasetTableName}
    SET file_id = ''
    WHERE (file_id = 'undefined' OR LENGTH(file_id) < 20) AND file_id != '';`);

    jsonRes(res, {
      data: {
        data,
        pg
      }
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
