import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoBill } from '@fastgpt/service/support/wallet/bill/schema';
import { createDefaultTeam, getDefaultTeamMember } from '@/service/support/user/team/controller';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { UserModelSchema } from '@fastgpt/global/support/user/type';
import { delay } from '@/utils/tools';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import {
  DatasetCollectionSchemaType,
  DatasetSchemaType,
  DatasetTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';
import { PermissionTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { Types } from 'mongoose';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { PgClient } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50 } = req.body as { limit: number };
    await connectToDatabase();

    // await initDefaultTeam(limit);
    // await initMongoTeamId(limit);
    // await initDataset();
    await initCollectionFileTeam(limit);
    // await initPgData();

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

async function initDefaultTeam(limit: number) {
  /* init user default Team */
  const users = await MongoUser.find({}, '_id balance');
  console.log('init user default team', users.length);
  // 100 组一次
  const userArr: UserModelSchema[][] = [];
  for (let i = 0; i < users.length; i += limit) {
    userArr.push(users.slice(i, i + limit));
  }
  let success = 0;
  for await (const users of userArr) {
    await Promise.all(users.map(init));
    success += limit;
    console.log(success);
  }

  async function init(user: UserModelSchema) {
    try {
      await createDefaultTeam({
        userId: user._id,
        balance: user.balance
      });
    } catch (error) {
      console.log(error);

      await delay(1000);
      return init(user);
    }
  }
}
async function initMongoTeamId(limit: number) {
  const mongoSchema = [
    // {
    //   label: 'MongoDataset',
    //   schema: MongoDataset
    // },
    // {
    //   label: 'MongoDatasetCollection',
    //   schema: MongoDatasetCollection
    // },
    // {
    //   label: 'MongoDatasetTraining',
    //   schema: MongoDatasetTraining
    // },
    // {
    //   label: 'MongoBill',
    //   schema: MongoBill
    // },
    {
      label: 'MongoOutLink',
      schema: MongoOutLink
    },
    {
      label: 'MongoOpenApi',
      schema: MongoOpenApi
    }
  ];
  /* init user default Team */
  const users = await MongoUser.find({}, '_id');
  console.log('user total', users.length);
  // limit 组一次
  const userArr: UserModelSchema[][] = [];
  for (let i = 0; i < users.length; i += limit) {
    userArr.push(users.slice(i, i + limit));
  }

  for await (const item of mongoSchema) {
    console.log('start init', item.label);
    await initTeamTmbId(item.schema);
    console.log('finish init', item.label);
  }

  async function initTeamTmbId(schema: any) {
    let success = 0;
    for await (const users of userArr) {
      await Promise.all(users.map(init));
      success += limit;
      console.log(success);
    }

    async function init(user: UserModelSchema) {
      const userId = user._id;
      try {
        const tmb = await getDefaultTeamMember(userId);

        await schema.updateMany(
          {
            userId
          },
          {
            teamId: tmb.teamId,
            tmbId: tmb.tmbId
          }
        );
      } catch (error) {
        if (error === 'default team not exist') {
          return;
        }
        console.log(error);
        await delay(1000);
        return init(user);
      }
    }
  }
}
async function initDataset() {
  await MongoDataset.updateMany(
    {},
    {
      $set: {
        permission: PermissionTypeEnum.private
      }
    }
  );
}
async function initCollectionFileTeam(limit: number) {
  /* init user default Team */
  const DatasetFile = connectionMongo.connection.db.collection(`dataset.files`);
  const files: any[] = await DatasetFile.find(
    {},
    {
      projection: {
        _id: 1,
        metadata: 1
      }
    }
  ).toArray();
  console.log('init dataset default team', files.length);

  const dataArr: {
    _id: string;
    metadata: { userId: string };
  }[][] = [];
  for (let i = 0; i < files.length; i += limit) {
    dataArr.push(files.slice(i, i + limit));
  }

  let success = 0;
  for await (const item of dataArr) {
    await Promise.all(item.map(init));
    success += limit;
    console.log(success);
  }

  async function init(item: any) {
    try {
      const tmb = await getDefaultTeamMember(item.metadata.userId);

      await DatasetFile.findOneAndUpdate(
        {
          _id: item._id
        },
        {
          $set: {
            'metadata.teamId': String(tmb.teamId),
            'metadata.tmbId': String(tmb.tmbId)
          }
        }
      );
    } catch (error) {
      if (error === 'default team not exist') {
        return;
      }
      console.log(error);
      await delay(1000);
      return init(item);
    }
  }
}
async function initPgData() {
  const limit = 10;
  // add column
  try {
    await Promise.all([
      PgClient.query(`ALTER TABLE ${PgDatasetTableName} ADD COLUMN team_id CHAR(50);`),
      PgClient.query(`ALTER TABLE ${PgDatasetTableName} ADD COLUMN tmb_id CHAR(50);`),
      PgClient.query(`ALTER TABLE ${PgDatasetTableName} ALTER COLUMN user_id DROP NOT NULL;`)
    ]);
  } catch (error) {
    console.log(error);
    console.log('column exits');
  }

  const { rows } = await PgClient.query<{ user_id: string }>(`
  SELECT DISTINCT user_id FROM ${PgDatasetTableName} WHERE team_id IS NULL;
`);
  console.log('init pg', rows.length);
  let success = 0;
  for (let i = 0; i < limit; i++) {
    await init(i);
  }
  async function init(index: number) {
    const userId = rows[index].user_id;
    if (!userId) return;
    try {
      const tmb = await getDefaultTeamMember(userId);
      // update pg
      await PgClient.query(
        `Update ${PgDatasetTableName} set team_id = '${tmb.teamId}', tmb_id = '${tmb.tmbId}' where user_id = '${userId}'`
      );
      console.log(++success);
      init(index + limit);
    } catch (error) {
      if (error === 'default team not exist') {
        return;
      }
      console.log(error);
      await delay(1000);
      return init(index);
    }
  }
}
