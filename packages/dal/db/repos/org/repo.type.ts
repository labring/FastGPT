import { EntityIdSchema } from '@fastgpt/global/common/string/entityId';
import z from 'zod';
import type { DbSession } from '../../types';

/** 组织存在性校验窄 Read Schema。 */
export const OrgIdReadSchema = z.object({
  _id: EntityIdSchema
});

/** Org 主体解析公开仓储契约。 */
export type OrgLookupRepository = {
  /** 校验并返回指定团队内存在的组织 ID 集合；非法 ID 自动忽略。 */
  findTeamOrgIds: (params: {
    teamId: string;
    orgIds: string[];
    tx?: DbSession;
  }) => Promise<Set<string>>;
};
