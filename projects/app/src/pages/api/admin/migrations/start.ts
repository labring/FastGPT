import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  StartSystemMigrationBodySchema,
  type StartSystemMigrationBody
} from '@fastgpt/global/migration/schema';
import { startManualSystemMigration } from '@/migration/service';
import { wakeSystemMigrationRunner } from '@/migration/runner';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { NextAPI } from '@/service/middleware/entry';

/** Root 管理员确认执行条件后，将 waiting 手动任务放入串行队列。 */
async function handler(req: ApiRequestProps<StartSystemMigrationBody>): Promise<void> {
  await authSystemAdmin({ req });
  const { migrationId } = parseApiInput({
    req,
    bodySchema: StartSystemMigrationBodySchema
  }).body;

  await startManualSystemMigration(migrationId);
  // waiting 不保留后台扫描器；入队成功后立即唤醒本节点 runner。
  wakeSystemMigrationRunner();
}

export default NextAPI(handler);
