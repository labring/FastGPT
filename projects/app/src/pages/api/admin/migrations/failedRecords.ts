import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  GetSystemMigrationFailedRecordsQuerySchema,
  type GetSystemMigrationFailedRecordsQuery,
  SystemMigrationFailedRecordsResponseSchema,
  type SystemMigrationFailedRecordsResponse
} from '@fastgpt/global/migration/schema';
import { getSystemMigrationFailedRecords } from '@/migration/service';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { NextAPI } from '@/service/middleware/entry';

/** Root 管理员按需读取失败明细，避免明细进入高频列表轮询响应。 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetSystemMigrationFailedRecordsQuery>
): Promise<SystemMigrationFailedRecordsResponse> {
  await authSystemAdmin({ req });
  const { query } = parseApiInput({
    req,
    querySchema: GetSystemMigrationFailedRecordsQuerySchema
  });
  return SystemMigrationFailedRecordsResponseSchema.parse(
    await getSystemMigrationFailedRecords(query.migrationId, query.stageKey)
  );
}

export default NextAPI(handler);
