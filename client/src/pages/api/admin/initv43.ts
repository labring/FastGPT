// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authUser({ req, authRoot: true });

    const { rowCount } = await PgClient.query(`SELECT 1
    FROM   information_schema.columns 
    WHERE  table_schema = 'public'
    AND    table_name   = '${PgDatasetTableName}'
    AND    column_name  = 'file_id'`);

    if (rowCount > 0) {
      return jsonRes(res, {
        data: '已经存在file_id字段'
      });
    }

    jsonRes(res, {
      data: await PgClient.query(
        `ALTER TABLE ${PgDatasetTableName} ADD COLUMN file_id VARCHAR(100)`
      )
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
