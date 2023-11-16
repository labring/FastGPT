import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { delay } from '@/utils/tools';
import { PgClient } from '@fastgpt/service/common/pg';
import {
  DatasetDataIndexTypeEnum,
  PgDatasetTableName
} from '@fastgpt/global/core/dataset/constant';

import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { Types, connectionMongo } from '@fastgpt/service/common/mongo';
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';

let success = 0;
/* pg 中的数据搬到 mongo dataset.datas 中，并做映射 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50 } = req.body as { limit: number };
    await authCert({ req, authRoot: true });
    await connectToDatabase();
    success = 0;

    jsonRes(res, {
      data: await init(limit)
    });
  } catch (error) {
    console.log(error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}

type PgItemType = {
  id: string;
  q: string;
  a: string;
  dataset_id: string;
  collection_id: string;
  data_id: string;
};

async function init(limit: number): Promise<any> {
  const { rows } = await PgClient.query<{ id: string; data_id: string }>(
    `SELECT id,data_id FROM ${PgDatasetTableName} WHERE team_id = tmb_id`
  );

  console.log('totalCount', rows.length);

  await delay(2000);

  if (rows.length === 0) return;

  for (let i = 0; i < limit; i++) {
    initData(i);
  }

  async function initData(index: number): Promise<any> {
    const item = rows[index];
    if (!item) {
      console.log('done');
      return;
    }
    // get mongo
    const mongoData = await MongoDatasetData.findById(item.data_id, '_id teamId tmbId');
    if (!mongoData) {
      return initData(index + limit);
    }

    try {
      // find team owner
      const db = connectionMongo?.connection?.db;
      const TeamMember = db.collection(TeamMemberCollectionName);

      const tmb = await TeamMember.findOne({
        teamId: new Types.ObjectId(mongoData.teamId),
        role: 'owner'
      });

      if (!tmb) {
        return initData(index + limit);
      }

      // update mongo and pg tmb_id
      await MongoDatasetData.findByIdAndUpdate(item.data_id, {
        tmbId: tmb._id
      });
      await PgClient.query(
        `UPDATE ${PgDatasetTableName} SET tmb_id = '${String(tmb._id)}' WHERE id = '${item.id}'`
      );

      console.log(++success);

      return initData(index + limit);
    } catch (error) {
      console.log(error);
      await delay(500);
      return initData(index);
    }
  }
}
