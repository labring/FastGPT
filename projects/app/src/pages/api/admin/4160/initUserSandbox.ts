import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { BoolSchema } from '@fastgpt/global/common/zod';
import { migrateLegacySandboxesToUserLevel } from '@fastgpt/service/core/ai/sandbox/application/migration';
import z from 'zod';

const InitUserSandboxBodySchema = z.object({
  dryRun: BoolSchema.optional().default(true)
});

const InitUserSandboxResponseSchema = z.object({
  dryRun: z.boolean(),
  legacySkillCount: z.number().int().nonnegative(),
  migratedSkillCount: z.number().int().nonnegative(),
  legacyAppCount: z.number().int().nonnegative(),
  migratedAppCount: z.number().int().nonnegative(),
  appGroupCount: z.number().int().nonnegative(),
  completedAppGroupCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  failures: z.array(
    z.object({
      sandboxId: z.string(),
      error: z.string()
    })
  )
});
type InitUserSandboxResponse = z.infer<typeof InitUserSandboxResponseSchema>;

/** 管理员升级入口；默认 dry-run，真实执行时迁移全部 Legacy Sandbox。 */
async function handler(req: ApiRequestProps): Promise<InitUserSandboxResponse> {
  await authCert({ req, authRoot: true });
  const { dryRun } = parseApiInput({
    req,
    bodySchema: InitUserSandboxBodySchema
  }).body;

  const result = await migrateLegacySandboxesToUserLevel({ dryRun });
  return InitUserSandboxResponseSchema.parse(result);
}

export default NextAPI(handler);
