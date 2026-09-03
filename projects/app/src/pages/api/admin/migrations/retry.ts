import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  RetrySystemMigrationBodySchema,
  type RetrySystemMigrationBody
} from '@fastgpt/global/migration/schema';
import { retryNonBlockingSystemMigration } from '@/migration/service';
import { wakeSystemMigrationRunner } from '@/migration/runner';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { NextAPI } from '@/service/middleware/entry';

/** Root 管理员修复数据后，将非阻塞 failed 任务重新放回串行队列。 */
async function handler(req: ApiRequestProps<RetrySystemMigrationBody>): Promise<void> {
  await authSystemAdmin({ req });
  const { migrationId } = parseApiInput({
    req,
    bodySchema: RetrySystemMigrationBodySchema
  }).body;

  await retryNonBlockingSystemMigration(migrationId);
  // failed 是终态，后台扫描器可能已经停掉；重置成功后立即恢复本节点扫描。
  wakeSystemMigrationRunner();
}

export default NextAPI(handler);
