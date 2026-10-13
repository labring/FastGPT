import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  SystemMigrationListResponseSchema,
  type SystemMigrationListResponse
} from '@fastgpt/global/migration/schema';
import { getSystemMigrationList } from '@/migration/service';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { NextAPI } from '@/service/middleware/entry';

/** 返回静态注册信息与 Mongo 最新状态合并后的管理员视图。 */
async function handler(req: ApiRequestProps): Promise<SystemMigrationListResponse> {
  await authSystemAdmin({ req });
  return SystemMigrationListResponseSchema.parse(await getSystemMigrationList());
}

export default NextAPI(handler);
