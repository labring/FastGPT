import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { BoolSchema, IntSchema } from '@fastgpt/global/common/zod';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  archiveSandboxResources,
  getConfiguredSandboxProvider
} from '@fastgpt/service/core/ai/sandbox/interface/admin';
import { getLogger } from '@fastgpt/service/common/logger';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { agentSandboxProviderList } from '@fastgpt/global/core/ai/sandbox/constants';
import { subDays } from 'date-fns';
import z from 'zod';

const logger = getLogger(['initSandboxArchiveV2']);
const SANDBOX_ARCHIVE_TRACE_SOURCE = 'initSandboxArchive';

const InitSandboxArchiveV2BodySchema = z.object({
  runArchive: BoolSchema.optional().default(false),
  inactiveDays: IntSchema.max(36500).optional(),
  inactiveBefore: z.coerce.date().optional()
});

const SandboxArchiveResultSchema = z.object({
  total: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  failCount: z.number().int().nonnegative(),
  failures: z.array(
    z.object({
      sandboxId: z.string(),
      error: z.string()
    })
  )
});

const InitSandboxArchiveV2ResponseSchema = z.object({
  archiveTriggered: z.boolean(),
  archiveCandidateCount: z.number().int().nonnegative(),
  archiveResult: SandboxArchiveResultSchema.nullable(),
  duration: z.number().int().nonnegative(),
  activeProvider: z.enum(agentSandboxProviderList),
  inactiveBefore: z.string()
});
type InitSandboxArchiveV2Response = z.infer<typeof InitSandboxArchiveV2ResponseSchema>;

/**
 * 归档 v2 集合中长期不活跃的 Sandbox。
 *
 * 候选统计和正式执行都只使用 v2 顶层 status 与 operation 契约，并复用标准 archive 状态机。
 */
async function handler(req: ApiRequestProps): Promise<InitSandboxArchiveV2Response> {
  await authCert({ req, authRoot: true });
  const { runArchive, inactiveDays, inactiveBefore } = parseApiInput({
    req,
    bodySchema: InitSandboxArchiveV2BodySchema
  }).body;
  const startTime = Date.now();
  const activeProvider = getConfiguredSandboxProvider();
  const archiveBefore =
    inactiveBefore ?? subDays(new Date(), inactiveDays === undefined ? 7 : inactiveDays);
  const archiveCandidateCount = await MongoSandboxInstance.countDocuments({
    provider: activeProvider,
    status: 'stopped',
    lastActiveAt: { $lt: archiveBefore },
    'metadata.operation': { $exists: false }
  });

  const archiveResult = runArchive
    ? await archiveSandboxResources({
        inactiveBefore: archiveBefore,
        providers: [activeProvider],
        options: {
          onProgress: (progress) => {
            logger.info('Sandbox archive progress', {
              provider: activeProvider,
              total: archiveCandidateCount,
              ...progress
            });
          }
        }
      })
    : null;

  if (archiveResult) {
    await Promise.all(
      archiveResult.failures.map((failure) =>
        Promise.resolve(
          pushTrack.sandboxArchive({
            provider: activeProvider,
            sandboxId: failure.sandboxId,
            reason: failure.error,
            source: SANDBOX_ARCHIVE_TRACE_SOURCE
          })
        ).catch((error) => {
          logger.error('Failed to record sandbox archive track', {
            provider: activeProvider,
            sandboxId: failure.sandboxId,
            error
          });
        })
      )
    );
  }

  return InitSandboxArchiveV2ResponseSchema.parse({
    archiveTriggered: runArchive,
    archiveCandidateCount,
    archiveResult,
    duration: Date.now() - startTime,
    activeProvider,
    inactiveBefore: archiveBefore.toISOString()
  });
}

export default NextAPI(handler);
