import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { Types } from 'mongoose';
import z from 'zod';
import { MongoRepositoryBase } from '../../../mongo/base';
import type { DbRuntime } from '../../../runtime';
import type { DbSession } from '../../../types';
import type { TeamMemberLookupRepository } from '../repo.type';
import { teamMemberLookupMongoCollection, type TeamMemberLookupMongoDoc } from './schema';

const TeamMemberPassthroughReadSchema = z.unknown();

/** team_members 的 MongoDB 主体解析仓储实现。 */
export class MongoTeamMemberLookupRepository
  extends MongoRepositoryBase<TeamMemberLookupMongoDoc, typeof TeamMemberPassthroughReadSchema>
  implements TeamMemberLookupRepository
{
  constructor(runtime?: DbRuntime) {
    super({
      collection: teamMemberLookupMongoCollection,
      readSchema: TeamMemberPassthroughReadSchema,
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

    return new Map(members.map((member) => [String(member.userId), String(member._id)]));
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

    return new Set(members.map((item) => String(item._id)));
  }
}
