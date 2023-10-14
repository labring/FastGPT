import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@fastgpt/support/user/auth';
import { connectToDatabase } from '@/service/mongo';
import { PgClient } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';
import { DatasetSpecialIdEnum } from '@fastgpt/core/dataset/constant';
import { Types, connectionMongo } from '@fastgpt/common/mongo';
import { delay } from '@/utils/tools';
import { replaceVariable } from '@/utils/common/tools/text';
import { getVector } from '../openapi/plugin/vector';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // await connectToDatabase();
    // const { text, analyze, sql } = req.body as {
    //   userId: string;
    //   text: string;
    //   analyze?: boolean;
    //   sql: string;
    // };
    // await authUser({ req, authRoot: true });

    // const vectorModel = global.vectorModels[0];
    // const { vectors } = await getVector({
    //   model: vectorModel.model,
    //   input: [text]
    // });

    // const start = Date.now();
    // const result: any = await PgClient.query(sql.replace(/\[vector\]/g, `[${vectors[0]}]`));

    jsonRes(res, {
      data: {
        // rows: result?.[2]?.rows,
        // time: Date.now() - start
      }
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
