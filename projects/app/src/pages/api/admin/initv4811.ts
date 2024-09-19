import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';
import { POST } from '@fastgpt/service/common/api/plusRequest';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { delay } from '@fastgpt/global/common/system/utils';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';

/* 
  1. 给每个 team 创建一个默认的 group
*/
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authCert({ req, authRoot: true });

    const teamList = await MongoTeam.find({}, '_id');
    console.log('Total team', teamList.length);
    let success = 0;

    async function createGroup(teamId: string) {
      try {
        await MongoMemberGroupModel.updateOne(
          {
            teamId,
            name: DefaultGroupName
          },
          {
            $set: {
              teamId: teamId,
              name: DefaultGroupName
            }
          },
          {
            upsert: true
          }
        );
      } catch (error) {
        console.log(error);
        await delay(500);
        return createGroup(teamId);
      }
    }
    for await (const team of teamList) {
      await createGroup(team._id);
      console.log(++success);
    }

    jsonRes(res, {
      message: 'success'
    });
  } catch (error) {
    console.log(error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}
