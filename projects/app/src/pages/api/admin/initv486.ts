import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
const logger = getLogger(LogCategories.SYSTEM);

/* pg 中的数据搬到 mongo dataset.datas 中，并做映射 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authCert({ req, authRoot: true });

    await MongoApp.updateMany(
      {},
      {
        $set: {
          inheritPermission: true
        }
      }
    );

    jsonRes(res, {
      message: 'success'
    });
  } catch (error) {
    logger.error('Migration v486 failed', { error });

    jsonRes(res, {
      code: 500,
      error
    });
  }
}
