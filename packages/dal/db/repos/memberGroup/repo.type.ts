import { EntityIdSchema } from '@fastgpt/global/common/string/entityId';
import z from 'zod';
import type { DbSession } from '../../types';

/** 成员分组存在性校验窄 Read Schema。 */
export const MemberGroupIdReadSchema = z.object({
  _id: EntityIdSchema
});

/** MemberGroup 主体解析公开仓储契约。 */
export type MemberGroupLookupRepository = {
  /** 校验并返回指定团队内存在的成员分组 ID 集合；非法 ID 自动忽略。 */
  findTeamMemberGroupIds: (params: {
    teamId: string;
    groupIds: string[];
    tx?: DbSession;
  }) => Promise<Set<string>>;
};
