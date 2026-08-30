import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { cleanupDanglingResourcePermissions } from '@/service/admin/4162/permissionCleanup';
import { materializeResourcePermissions } from '@/service/admin/4162/permissionMigration';
import {
  ACL_RESOURCE_BATCH_SIZE,
  InitPermissionBodySchema,
  InitPermissionResponseSchema,
  PERMISSION_CLEANUP_BATCH_SIZE,
  type InitPermissionResponse
} from '@/service/admin/4162/permissionSchema';

/** 先清理无效权限，再将所有资源 ACL 物化为完整有效快照；两阶段默认仅 dry-run。 */
async function handler(req: ApiRequestProps): Promise<InitPermissionResponse> {
  await authCert({ req, authRoot: true });
  const { body } = parseApiInput({ req, bodySchema: InitPermissionBodySchema });
  const { dryRun, teamId, teamConcurrency, sampleLimit } = body;

  const cleanup = await cleanupDanglingResourcePermissions({
    dryRun,
    teamId,
    batchSize: PERMISSION_CLEANUP_BATCH_SIZE,
    sampleLimit
  });
  const migration = await materializeResourcePermissions({
    dryRun,
    teamId,
    batchSize: ACL_RESOURCE_BATCH_SIZE,
    teamConcurrency
  });

  return InitPermissionResponseSchema.parse({ cleanup, migration });
}

export default NextAPI(handler);
