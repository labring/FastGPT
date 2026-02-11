import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { type NextApiRequest, type NextApiResponse } from 'next';
import { getLogger } from '@fastgpt/service/common/logger';
const logger = getLogger(['initv4822']);

/*
 * 复制 Team 表中的 notificationAccount 到 User 表的 contact 中
 */
async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });
  const users = await MongoUser.find();
  const teams = await MongoTeam.find();

  logger.info('Start bill migration', { totalUsers: users.length });
  let success = 0;
  for await (const user of users) {
    try {
      const team = teams.find((team) => String(team.ownerId) === String(user._id));
      if (team && !user.contact) {
        user.contact = team.notificationAccount;
      }
      await user.save();
      logger.info('Bill migration progress', { success: ++success });
    } catch (error) {
      logger.error('Failed to migrate user bill records', { error });
    }
  }

  return { success: true };
}

export default NextAPI(handler);
