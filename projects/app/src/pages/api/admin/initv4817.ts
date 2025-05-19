import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { NextApiRequest, NextApiResponse } from 'next';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  const users = await MongoUser.find(
    { openaiAccount: { $exists: true, $ne: null } },
    '_id openaiAccount'
  );

  console.log(`共 ${users.length} 个用户需要更新`);
  let count = 0;
  for (const user of users) {
    await mongoSessionRun(async (session) => {
      await MongoTeam.updateOne(
        { ownerId: user._id },
        {
          $set: { openaiAccount: (user as any).openaiAccount }
        },
        { session }
      );

      // @ts-ignore
      user.openaiAccount = undefined;
      await user.save({ session });
    });
    count++;
    console.log(`已更新 ${count} 个用户`);
  }

  return { success: true };
}

export default NextAPI(handler);
