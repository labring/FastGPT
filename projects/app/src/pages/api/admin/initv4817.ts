import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { NextApiRequest, NextApiResponse } from 'next';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  const users = await MongoUser.find({ openaiAccount: { $exists: true, $ne: null } });
  for (const user of users) {
    await MongoTeam.updateOne(
      { ownerId: user._id },
      {
        $set: { openaiAccount: (user as any).openaiAccount }
      },
      { new: true }
    );

    await MongoUser.updateOne({ _id: user._id }, { $unset: { openaiAccount: '' } });
  }

  return { success: true };
}

export default NextAPI(handler);
