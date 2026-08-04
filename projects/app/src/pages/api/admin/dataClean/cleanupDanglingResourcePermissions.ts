import { NextAPI } from '@/service/middleware/entry';
import {
  CleanupDanglingResourcePermissionsBodySchema,
  CleanupDanglingResourcePermissionsResponseSchema,
  type CleanupDanglingResourcePermissionsResult
} from '@fastgpt/global/support/permission/dataClean/controller.schema';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { cleanupDanglingResourcePermissions } from '@fastgpt/service/support/permission/dataClean/danglingPermission';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

/* ============================================================================
 * API: 清理悬垂资源权限
 * Route: POST /api/admin/dataClean/cleanupDanglingResourcePermissions
 * Method: POST
 * Description: 检查权限记录引用的团队、协作者和资源是否存在，可选择删除悬垂权限。
 * Tags: ['Admin', 'DataClean', 'Permission', 'Delete']
 * ============================================================================ */

/** 管理员权限悬垂引用清理入口，默认仅执行 dry-run。 */
async function handler(req: ApiRequestProps): Promise<CleanupDanglingResourcePermissionsResult> {
  await authCert({ req, authRoot: true });

  const { body } = parseApiInput({
    req,
    bodySchema: CleanupDanglingResourcePermissionsBodySchema
  });

  return CleanupDanglingResourcePermissionsResponseSchema.parse(
    await cleanupDanglingResourcePermissions(body)
  );
}

export default NextAPI(handler);
