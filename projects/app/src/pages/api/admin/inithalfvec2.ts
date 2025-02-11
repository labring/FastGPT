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

    // 设置halfvector字段为非空
    await PgClient.query(
      `BEGIN;
      ALTER TABLE ${DatasetVectorTableName} ALTER COLUMN halfvector SET NOT NULL;
      DROP INDEX IF EXISTS vector_index;
      ALTER TABLE ${DatasetVectorTableName} DROP COLUMN IF EXISTS vector;
      COMMIT;
      `
    );

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
