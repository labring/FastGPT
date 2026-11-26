import { EntityIdSchema } from '@fastgpt/global/common/string/entityId';
import z from 'zod';
import type { DbSession } from '../../types';

/** User 用户名主体解析窄 Read Schema。 */
export const UserLookupReadSchema = z.object({
  _id: EntityIdSchema,
  username: z.string()
});

/** User 主体解析公开仓储契约。 */
export type UserLookupRepository = {
  /** 按 username 批量查询用户 ID 映射（userId -> username）。 */
  findUsernamesByUserIds: (params: {
    usernames: string[];
    tx?: DbSession;
  }) => Promise<Map<string, string>>;
};
