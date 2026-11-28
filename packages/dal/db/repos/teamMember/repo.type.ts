import { EntityIdSchema } from '@fastgpt/global/common/string/entityId';
import z from 'zod';
import type { DbSession } from '../../types';

/** 团队成员 userId -> tmbId 映射查询窄 Read Schema。 */
export const TeamMemberUserIdReadSchema = z.object({
  _id: EntityIdSchema,
  userId: EntityIdSchema
});

/** 团队成员存在性校验窄 Read Schema。 */
export const TeamMemberIdReadSchema = z.object({
  _id: EntityIdSchema
});

/** TeamMember 主体解析公开仓储契约。 */
export type TeamMemberLookupRepository = {
  /** 查询指定团队内处于 active 状态的 userId -> tmbId 映射。 */
  findActiveTeamMemberIdsByUserIds: (params: {
    teamId: string;
    userIds: string[];
    tx?: DbSession;
  }) => Promise<Map<string, string>>;
  /** 校验并返回指定团队内处于 active 状态的 tmbId 集合；非法 ID 自动忽略。 */
  findActiveTeamMemberIds: (params: {
    teamId: string;
    tmbIds: string[];
    tx?: DbSession;
  }) => Promise<Set<string>>;
};
