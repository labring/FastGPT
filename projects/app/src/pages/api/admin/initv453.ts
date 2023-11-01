import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { createDefaultTeam } from '@/service/support/user/team/controller';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { UserModelSchema } from '@fastgpt/global/support/user/type';
import { delay } from '@/utils/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50 } = req.body as { limit: number };
    await connectToDatabase();

    /* init user default Team */
    const users = await MongoUser.find({}, '_id');
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

async function init(user: UserModelSchema) {
  try {
    await createDefaultTeam({
      userId: user._id
    });
  } catch (error) {
    console.log(error);

    await delay(1000);
    return;
  }
}
