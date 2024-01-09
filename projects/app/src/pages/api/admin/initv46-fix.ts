import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { delay } from '@fastgpt/global/common/system/utils';
import { PgClient } from '@fastgpt/service/common/vectorStore/pg';
import { PgDatasetTableName } from '@fastgpt/global/common/vectorStore/constants';

import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { Types, connectionMongo } from '@fastgpt/service/common/mongo';
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';
import { getUserDefaultTeam } from '@fastgpt/service/support/user/team/controller';
import { getGFSCollection } from '@fastgpt/service/common/file/gridfs/controller';

let success = 0;
/* pg 中的数据搬到 mongo dataset.datas 中，并做映射 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50 } = req.body as { limit: number };
    await authCert({ req, authRoot: true });
    await connectToDatabase();
    success = 0;

    await init(limit);
    await initCollectionFileTeam(limit);

    jsonRes(res, {});
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

async function initCollectionFileTeam(limit: number) {
  /* init user default Team */
  const DatasetFile = getGFSCollection('dataset');
  const matchWhere = {
    $or: [{ 'metadata.teamId': { $exists: false } }, { 'metadata.teamId': null }]
  };
  const uniqueUsersWithNoTeamId = await DatasetFile.aggregate([
    {
      $match: matchWhere
    },
    {
      $group: {
        _id: '$metadata.userId', // 按 metadata.userId 分组以去重
        userId: { $first: '$metadata.userId' } // 保留第一个出现的 userId
      }
    },
    {
      $project: {
        _id: 0, // 不显示 _id 字段
        userId: 1 // 只显示 userId 字段
      }
    }
  ]).toArray();
  const users = uniqueUsersWithNoTeamId;

  console.log('un init total', users.length);
  // limit 组一次
  const userArr: any[][] = [];
  for (let i = 0; i < users.length; i += limit) {
    userArr.push(users.slice(i, i + limit));
  }

  let success = 0;
  for await (const item of userArr) {
    await Promise.all(item.map((item) => init(item.userId)));
    success += limit;
    console.log(success);
  }

  async function init(userId: string): Promise<any> {
    try {
      const tmb = await getUserDefaultTeam({
        userId
      });

      await DatasetFile.updateMany(
        {
          'metadata.userId': String(userId),
          ...matchWhere
        },
        {
          $set: {
            'metadata.teamId': String(tmb.teamId),
            'metadata.tmbId': String(tmb.tmbId)
          }
        }
      );
    } catch (error) {
      if (error === 'team not exist' || error === 'tmbId or userId is required') {
        return;
      }
      console.log(error);
      await delay(1000);
      return init(userId);
    }
  }
}
