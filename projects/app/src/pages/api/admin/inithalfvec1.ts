import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { PgClient } from '@fastgpt/service/common/vectorStore/pg';
import { DatasetVectorTableName } from '@fastgpt/service/common/vectorStore/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authCert({ req, authRoot: true });

    // pg 新建字段：halfvector
    const columnExists = await PgClient.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name='${DatasetVectorTableName}' AND column_name='halfvector';
    `);

    if (columnExists.rows.length === 0) {
      await PgClient.query(`
        BEGIN;
          ALTER TABLE ${DatasetVectorTableName} ADD COLUMN halfvector halfvec(1536);
        COMMIT;
      `);
      console.log('halfvector column added');
    }

    let rowsUpdated;
    do {
      rowsUpdated = await PgClient.query(`
        WITH updated AS (
          UPDATE ${DatasetVectorTableName}
          SET halfvector = vector::halfvec(1536)
          WHERE id IN (
              SELECT id
              FROM ${DatasetVectorTableName}
              WHERE halfvector IS NULL
              LIMIT 1000
          )
          RETURNING 1
        )
        SELECT count(*) FROM updated;
      `);
      console.log('rowsUpdated:', rowsUpdated.rows[0].count);
      // 每批次更新后休眠一段时间
      if (rowsUpdated.rows[0].count > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100)); // 休眠100毫秒
      }
    } while (rowsUpdated.rows[0].count > 0);

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
