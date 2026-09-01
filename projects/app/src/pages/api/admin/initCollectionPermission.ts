import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  migrateCollectionPermissions,
  type InitCollectionPermissionResult
} from '@fastgpt/service/support/permission/collection/migrate';
import z from 'zod';

const InitCollectionPermissionBodySchema = z.object({
  /** 指定团队（可选，仅系统管理员可指定）；未传处理所有团队。 */
  teamId: z.string().optional(),
  /** 单次调用最多处理的 dataset 数（分批调用控制单请求耗时）。 */
  limit: z.number().min(1).optional(),
  /** 仅校验与统计，不写库；存在孤儿 / 循环的 dataset 会在 errors 中报出。 */
  dryRun: z.boolean().optional()
});

type InitCollectionPermissionBody = z.infer<typeof InitCollectionPermissionBodySchema>;

/** 将存量 collection 物化为 collection 级权限快照；鉴权：仅系统管理员。 */
async function handler(
  req: ApiRequestProps<InitCollectionPermissionBody>
): Promise<InitCollectionPermissionResult> {
  const { teamId, limit, dryRun } = parseApiInput({
    req,
    bodySchema: InitCollectionPermissionBodySchema
  }).body;

  await authCert({ req, authRoot: true });

  return migrateCollectionPermissions({ teamId, limit, dryRun });
}

export default NextAPI(handler);
