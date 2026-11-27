import { MongoRepositoryBase } from '../../../mongo/base';
import type { DbRuntime } from '../../../runtime';
import type { DbSession } from '../../../types';
import { UserLookupReadSchema, type UserLookupRepository } from '../repo.type';
import { userLookupMongoCollection, type UserLookupMongoDoc } from './schema';

/** users 的 MongoDB 主体解析仓储实现。 */
export class MongoUserLookupRepository
  extends MongoRepositoryBase<UserLookupMongoDoc, typeof UserLookupReadSchema>
  implements UserLookupRepository
{
  constructor(runtime?: DbRuntime) {
    super({
      collection: userLookupMongoCollection,
      readSchema: UserLookupReadSchema,
      runtime
    });
  }

  /** 按 username 批量查询用户 ID 映射（userId -> username）。 */
  async findUsernamesByUserIds({
    usernames,
    tx
  }: {
    usernames: string[];
    tx?: DbSession;
  }): Promise<Map<string, string>> {
    if (usernames.length === 0) return new Map();

    const users = await this.model
      .find({ username: { $in: usernames } }, 'username', this.txOpts(tx))
      .lean();

    const parsed = this.parseList(users);
    return new Map(parsed.map((user) => [user._id, user.username]));
  }
}
