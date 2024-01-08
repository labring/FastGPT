import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoBill } from '@fastgpt/service/support/wallet/bill/schema';
import {
  createDefaultTeam,
  getUserDefaultTeam
} from '@fastgpt/service/support/user/team/controller';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { UserModelSchema } from '@fastgpt/global/support/user/type';
import { delay } from '@fastgpt/global/common/system/utils';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { PermissionTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { PgClient } from '@fastgpt/service/common/vectorStore/pg';
import { PgDatasetTableName } from '@fastgpt/global/common/vectorStore/constants';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';
import { POST } from '@fastgpt/service/common/api/plusRequest';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getGFSCollection } from '@fastgpt/service/common/file/gridfs/controller';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50, maxSize = 3 } = req.body as { limit: number; maxSize: number };
    await authCert({ req, authRoot: true });
    await connectToDatabase();

    await initDefaultTeam(limit, maxSize);
    await initMongoTeamId(limit);
    await initDatasetAndApp();
    await initCollectionFileTeam(limit);

    if (FastGPTProUrl) {
      POST('/admin/init46');
    }

    await initPgData();

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

async function initDefaultTeam(limit: number, maxSize: number) {
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

  async function init(user: UserModelSchema): Promise<any> {
    try {
      await createDefaultTeam({
        userId: user._id,
        balance: user.balance,
        maxSize
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
    {
      label: 'MongoPlugin',
      schema: MongoPlugin
    },
    {
      label: 'MongoChat',
      schema: MongoChat
    },
    {
      label: 'MongoChatItem',
      schema: MongoChatItem
    },
    {
      label: 'MongoApp',
      schema: MongoApp
    },
    {
      label: 'MongoDataset',
      schema: MongoDataset
    },
    {
      label: 'MongoDatasetCollection',
      schema: MongoDatasetCollection
    },
    {
      label: 'MongoDatasetTraining',
      schema: MongoDatasetTraining
    },
    {
      label: 'MongoBill',
      schema: MongoBill
    },
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

  for await (const item of mongoSchema) {
    console.log('start init', item.label);
    await initTeamTmbId(item.schema);
    console.log('finish init', item.label);
  }

  async function initTeamTmbId(schema: any) {
    const emptyWhere = {
      $or: [{ teamId: { $exists: false } }, { teamId: null }]
    };
    const uniqueUsersWithNoTeamId = await schema.aggregate([
      {
        $match: emptyWhere
      },
      {
        $group: {
          _id: '$userId', // 按 userId 分组以去重
          userId: { $first: '$userId' } // 保留第一个出现的 userId
        }
      },
      {
        $project: {
          _id: 0, // 不显示 _id 字段
          userId: 1 // 只显示 userId 字段
        }
      }
    ]);
    const users = uniqueUsersWithNoTeamId;

    console.log('un init total', users.length);
    // limit 组一次
    const userArr: any[][] = [];
    for (let i = 0; i < users.length; i += limit) {
      userArr.push(users.slice(i, i + limit));
    }

    let success = 0;
    for await (const users of userArr) {
      await Promise.all(users.map((item) => init(item.userId)));
      success += limit;
      console.log(success);
    }

    async function init(userId: string): Promise<any> {
      try {
        const tmb = await getUserDefaultTeam({ userId });

        await schema.updateMany(
          {
            userId,
            ...emptyWhere
          },
          {
            teamId: tmb.teamId,
            tmbId: tmb.tmbId
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
}
async function initDatasetAndApp() {
  await MongoDataset.updateMany(
    {},
    {
      $set: {
        permission: PermissionTypeEnum.private
      }
    }
  );
  await MongoApp.updateMany(
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
async function initPgData() {
  const limit = 10;
  // add column
  try {
    await Promise.allSettled([
      PgClient.query(`ALTER TABLE ${PgDatasetTableName} ADD COLUMN team_id VARCHAR(50);`),
      PgClient.query(`ALTER TABLE ${PgDatasetTableName} ADD COLUMN tmb_id VARCHAR(50);`),
      PgClient.query(`ALTER TABLE ${PgDatasetTableName} ALTER COLUMN user_id DROP NOT NULL;`)
    ]);
  } catch (error) {
    console.log(error);
    console.log('column exists');
  }

  const { rows } = await PgClient.query<{ user_id: string }>(`
  SELECT DISTINCT user_id FROM ${PgDatasetTableName} WHERE team_id IS NULL;
`);
  console.log('init pg', rows.length);
  let success = 0;
  for (let i = 0; i < limit; i++) {
    init(i);
  }
  async function init(index: number): Promise<any> {
    const userId = rows[index]?.user_id;
    if (!userId) return;
    try {
      const tmb = await getUserDefaultTeam({ userId });
      // update pg
      await PgClient.query(
        `Update ${PgDatasetTableName} set team_id = '${tmb.teamId}', tmb_id = '${tmb.tmbId}' where user_id = '${userId}' AND team_id IS NULL;`
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
