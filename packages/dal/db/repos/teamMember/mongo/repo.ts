import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { Types } from 'mongoose';
import { MongoRepositoryBase } from '../../../mongo/base';
import type { DbRuntime } from '../../../runtime';
import type { DbSession } from '../../../types';
import {
  TeamMemberIdReadSchema,
  TeamMemberUserIdReadSchema,
  type TeamMemberLookupRepository
} from '../repo.type';
import { teamMemberLookupMongoCollection, type TeamMemberLookupMongoDoc } from './schema';

/** team_members 的 MongoDB 主体解析仓储实现。 */
export class MongoTeamMemberLookupRepository
  extends MongoRepositoryBase<TeamMemberLookupMongoDoc, typeof TeamMemberUserIdReadSchema>
  implements TeamMemberLookupRepository
{
  constructor(runtime?: DbRuntime) {
    super({
      collection: teamMemberLookupMongoCollection,
      readSchema: TeamMemberUserIdReadSchema,
      runtime
    });
  }

  /** 查询指定团队内处于 active 状态的 userId -> tmbId 映射。 */
  async findActiveTeamMemberIdsByUserIds({
    teamId,
    userIds,
    tx
  }: {
    teamId: string;
    userIds: string[];
    tx?: DbSession;
  }): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();

    const members = await this.model
      .find(
        {
          teamId,
          userId: { $in: userIds },
          status: TeamMemberStatusEnum.active
        },
        '_id userId',
        this.txOpts(tx)
      )
      .lean();

    const parsed = this.parseList(members);
    return new Map(parsed.map((member) => [member.userId, member._id]));
  }

  /** 校验并返回指定团队内处于 active 状态的 tmbId 集合；非法 ObjectId 自动忽略。 */
  async findActiveTeamMemberIds({
    teamId,
    tmbIds,
    tx
  }: {
    teamId: string;
    tmbIds: string[];
    tx?: DbSession;
  }): Promise<Set<string>> {
    const validObjectIds = tmbIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => this.oid(id));
    if (validObjectIds.length === 0) return new Set();

    const members = await this.model
      .find(
        {
          teamId,
          _id: { $in: validObjectIds },
          status: TeamMemberStatusEnum.active
        },
        '_id',
        this.txOpts(tx)
      )
      .lean();

    const parsed = this.parseList(members, TeamMemberIdReadSchema);
    return new Set(parsed.map((item) => item._id));
  }
}
