import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { respondSystemMigrationDependencyError } from '@/migration/error';
import {
  RetrySystemMigrationBodySchema,
  type RetrySystemMigrationBody
} from '@fastgpt/global/migration/schema';
import { retrySystemMigration } from '@/migration/service';
import { wakeSystemMigrationRunner } from '@/migration/runner';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { NextAPI } from '@/service/middleware/entry';

/** Root 管理员修复数据后，将 failed 任务重新交给 Runner 按注册模式执行。 */
async function handler(
  req: ApiRequestProps<RetrySystemMigrationBody>,
  res: ApiResponseType
): Promise<void> {
  await authSystemAdmin({ req });
  const { migrationId } = parseApiInput({
    req,
    bodySchema: RetrySystemMigrationBodySchema
  }).body;

  try {
    await retrySystemMigration(migrationId);
  } catch (error) {
    respondSystemMigrationDependencyError(res, error);
    return;
  }
  // failed 是终态，后台扫描器可能已经停掉；重置成功后立即恢复本节点扫描。
  wakeSystemMigrationRunner();
}

export default NextAPI(handler);
