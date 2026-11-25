import { unwrapMongoSession } from '@fastgpt/dal/db/mongo/base';
import type { DbSession } from '@fastgpt/dal/db/types';
import { MongoUser } from './schema';

/** 按 username 批量查询用户 ID 映射（userId -> username）。 */
export const findUsernamesByUserIds = async ({
  usernames,
  tx
}: {
  usernames: string[];
  tx?: DbSession;
}): Promise<Map<string, string>> => {
  if (usernames.length === 0) return new Map();

  const users = await MongoUser.find({ username: { $in: usernames } }, 'username')
    .session(unwrapMongoSession(tx) ?? null)
    .lean();

  return new Map(users.map((user) => [String(user._id), String(user.username)]));
};
