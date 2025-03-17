import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { NextApiRequest, NextApiResponse } from 'next';

/*
 * 复制 Team 表中的 notificationAccount 到 User 表的 contact 中
 */
async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });
  const users = await MongoUser.find();
  const teams = await MongoTeam.find();

  console.log('Total users:', users.length);
  let success = 0;
  for await (const user of users) {
    try {
      const team = teams.find((team) => String(team.ownerId) === String(user._id));
      if (team && !user.contact) {
        user.contact = team.notificationAccount;
      }
      await user.save();
      console.log('Success:', ++success);
    } catch (error) {
      console.error(error);
    }
  }

  return { success: true };
}

export default NextAPI(handler);
