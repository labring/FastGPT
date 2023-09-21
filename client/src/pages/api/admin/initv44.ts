// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { connectToDatabase, KB } from '@/service/mongo';
import { KbTypeEnum } from '@/constants/dataset';
import { PgClient } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authUser({ req, authRoot: true });

    await KB.updateMany(
      {
        type: { $exists: false }
      },
      {
        $set: {
          type: KbTypeEnum.dataset,
          parentId: null
        }
      }
    );

    const response = await PgClient.update(PgDatasetTableName, {
      where: [['file_id', 'undefined']],
      values: [{ key: 'file_id', value: '' }]
    });

    jsonRes(res, {
      data: response.rowCount
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
