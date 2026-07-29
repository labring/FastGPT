import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { BoolSchema } from '@fastgpt/global/common/zod';
import { migrateLegacySandboxesToUserLevel } from '@fastgpt/service/core/ai/sandbox/interface/migration';
import z from 'zod';

const InitUserSandboxBodySchema = z.object({
  dryRun: BoolSchema.optional().default(true)
});

const InitUserSandboxResponseSchema = z.object({
  dryRun: z.boolean(),
  normalization: z.object({
    skillMatchedCount: z.number().int().nonnegative(),
    skillModifiedCount: z.number().int().nonnegative(),
    appMatchedCount: z.number().int().nonnegative(),
    appModifiedCount: z.number().int().nonnegative(),
    legacyFieldMatchedCount: z.number().int().nonnegative(),
    legacyFieldModifiedCount: z.number().int().nonnegative(),
    orphanMatchedCount: z.number().int().nonnegative(),
    orphanDeletedCount: z.number().int().nonnegative(),
    orphanFailedCount: z.number().int().nonnegative(),
    sandboxPendingCount: z.number().int().nonnegative(),
    scannedSkillCount: z.number().int().nonnegative(),
    legacyDebugChatCleanup: z.object({
      conflictAppSkillCount: z.number().int().nonnegative(),
      cleanupSkillCount: z.number().int().nonnegative(),
      totalLegacyChats: z.number().int().nonnegative(),
      totalChatItems: z.number().int().nonnegative(),
      totalChatItemResponses: z.number().int().nonnegative(),
      deletedSkillCount: z.number().int().nonnegative(),
      skippedEmptyCount: z.number().int().nonnegative(),
      pendingChatCount: z.number().int().nonnegative(),
      list: z.array(
        z.object({
          skillId: z.string(),
          chatCount: z.number().int().nonnegative(),
          chatItemCount: z.number().int().nonnegative(),
          chatItemResponseCount: z.number().int().nonnegative(),
          deleted: z.boolean()
        })
      )
    }),
    pendingCount: z.number().int().nonnegative(),
    failures: z.array(
      z.object({
        sandboxId: z.string(),
        error: z.string()
      })
    )
  }),
  normalizationBlocked: z.boolean(),
  completedLegacyCount: z.number().int().nonnegative(),
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

/** 管理员升级入口；默认 dry-run，真实执行时先完成 beta6 清理再迁移 Legacy Sandbox。 */
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
