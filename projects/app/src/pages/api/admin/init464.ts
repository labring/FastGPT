import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';

import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { PgClient } from '@fastgpt/service/common/pg';
import { PgDatasetTableName } from '@fastgpt/global/core/dataset/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50, maxSize = 3 } = req.body as { limit: number; maxSize: number };
    await authCert({ req, authRoot: true });

    await PgClient.query(
      `ALTER TABLE ${PgDatasetTableName} ADD COLUMN createTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`
    );

    jsonRes(res, {
      data: {}
    });
  } catch (error) {
    console.log(error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}
