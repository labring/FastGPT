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
 * API: 清理无效资源权限
 * Route: POST /api/admin/dataClean/cleanupDanglingResourcePermissions
 * Method: POST
 * Description: 检查权限记录的外部引用及协作者目标结构，可选择删除无效权限。
 * Tags: ['Admin', 'DataClean', 'Permission', 'Delete']
 * ============================================================================ */

/** 管理员无效权限清理入口，默认仅执行 dry-run。 */
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
