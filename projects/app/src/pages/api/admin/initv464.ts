import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';

import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { PgClient } from '@fastgpt/service/common/vectorStore/pg';
import { PgDatasetTableName } from '@fastgpt/global/common/vectorStore/constants';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { connectToDatabase } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50, maxSize = 3 } = req.body as { limit: number; maxSize: number };
    await authCert({ req, authRoot: true });
    await connectToDatabase();

    try {
      await PgClient.query(
        `ALTER TABLE ${PgDatasetTableName} ADD COLUMN createTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`
      );
    } catch (error) {
      console.log(error);
    }

    try {
      const result = await MongoChatItem.updateMany(
        { userFeedback: { $exists: true } },
        { $rename: { userFeedback: 'userBadFeedback' } }
      );
      console.log(result);
    } catch (error) {
      console.log(error);
    }

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
