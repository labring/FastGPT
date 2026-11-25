import { unwrapMongoSession } from '@fastgpt/dal/db/mongo/base';
import type { UserLookupRepository } from '@fastgpt/dal/db/repos/user/repo.type';
import { MongoUser } from '../schema';

/** users 的 Mongo 仓储适配层（实现 `@fastgpt/dal/db/repos/user/repo.type` 公开契约）。 */
export const userRepo: UserLookupRepository = {
  /** 按 username 批量查询用户 ID 映射（userId -> username）。 */
  findUsernamesByUserIds: async ({ usernames, tx }): Promise<Map<string, string>> => {
    if (usernames.length === 0) return new Map();

    const users = await MongoUser.find({ username: { $in: usernames } }, 'username')
      .session(unwrapMongoSession(tx) ?? null)
      .lean();

    return new Map(users.map((user) => [String(user._id), String(user.username)]));
  }
};
