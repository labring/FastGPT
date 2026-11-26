import { Types } from 'mongoose';
import z from 'zod';
import { MongoRepositoryBase } from '../../../mongo/base';
import type { DbRuntime } from '../../../runtime';
import type { DbSession } from '../../../types';
import type { MemberGroupLookupRepository } from '../repo.type';
import { memberGroupLookupMongoCollection, type MemberGroupLookupMongoDoc } from './schema';

const MemberGroupPassthroughReadSchema = z.unknown();

/** team_member_groups 的 MongoDB 主体解析仓储实现。 */
export class MongoMemberGroupLookupRepository
  extends MongoRepositoryBase<MemberGroupLookupMongoDoc, typeof MemberGroupPassthroughReadSchema>
  implements MemberGroupLookupRepository
{
  constructor(runtime?: DbRuntime) {
    super({
      collection: memberGroupLookupMongoCollection,
      readSchema: MemberGroupPassthroughReadSchema,
      runtime
    });
  }

  /** 校验并返回指定团队内存在的成员分组 ID 集合；非法 ObjectId 自动忽略。 */
  async findTeamMemberGroupIds({
    teamId,
    groupIds,
    tx
  }: {
    teamId: string;
    groupIds: string[];
    tx?: DbSession;
  }): Promise<Set<string>> {
    const validObjectIds = groupIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => this.oid(id));
    if (validObjectIds.length === 0) return new Set();

    const groups = await this.model
      .find({ teamId, _id: { $in: validObjectIds } }, '_id', this.txOpts(tx))
      .lean();

    return new Set(groups.map((item) => String(item._id)));
  }
}
