import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/instance/schema';
import {
  archiveSandboxResources,
  type SandboxArchiveResult
} from '@fastgpt/service/core/ai/sandbox/service/archive';
import { getLogger } from '@fastgpt/service/common/logger';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { getConfiguredSandboxProvider } from '@fastgpt/service/core/ai/sandbox/provider/config';
import type { SandboxProviderType } from '@fastgpt/service/core/ai/sandbox/type';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { subDays } from 'date-fns';
import z from 'zod';

const logger = getLogger(['initSandboxArchive']);
const SANDBOX_ARCHIVE_TRACE_SOURCE = 'initSandboxArchive';

const InitSandboxArchiveBodySchema = z.object({
  runArchive: z.boolean().optional(),
  inactiveDays: z.number().min(0).optional(),
  inactiveBefore: z.coerce.date().optional()
});

interface MigrationResult {
  statusUpdateCount: number;
  lastActiveUpdatedCount: number;
  legacyMetadataUpdatedCount: number;
  archiveTriggered: boolean;
  archiveResult: SandboxArchiveResult | null;
  duration: number;
  activeProvider?: string;
}

const countSandboxArchiveCandidates = (params: {
  provider: SandboxProviderType;
  inactiveBefore: Date;
}) =>
  MongoSandboxInstance.countDocuments({
    provider: params.provider,
    status: 'stopped',
    lastActiveAt: { $lt: params.inactiveBefore },
    'metadata.archive.state': { $exists: false }
  });

/**
 * init 归档脚本统一记录归档失败埋点。
 * 归档 service 会把 zip 安装失败、workspace 超限、上传/删除失败等失败汇总到 failures。
 */
const traceSandboxArchiveFailures = async (params: {
  provider: SandboxProviderType;
  archiveResult: SandboxArchiveResult;
}) => {
  if (params.archiveResult.failures.length === 0) return;

  await Promise.all(
    params.archiveResult.failures.map((failure) =>
      Promise.resolve(
        pushTrack.sandboxArchive({
          provider: params.provider,
          sandboxId: failure.sandboxId,
          reason: failure.error,
          source: SANDBOX_ARCHIVE_TRACE_SOURCE
        })
      ).catch((error) => {
        logger.error('Failed to record sandbox archive track', {
          provider: params.provider,
          sandboxId: failure.sandboxId,
          error
        });
      })
    )
  );
};

/**
 * AI 沙盒冷归档与状态数据迁移脚本
 *
 * 职责：
 * 1. 状态纠错（拼写错误）：由于历史版本中 sandbox 状态拼写为 `'stoped'`，将其批量修正为 `'stopped'`。
 * 2. 补全 `lastActiveAt`：对缺失 `lastActiveAt` 字段的历史沙盒数据，通过 MongoDB 聚合更新，
 *    默认采用实例的创建时间 `createdAt`。若 `createdAt` 也不存在，则使用当前运行时间填充。
 * 3. 兼容 upstream/main 旧 edit-debug metadata：把 `metadata.metadata.versionId/skillName`
 *    提升到当前代码读取的 `metadata.versionId/skillName`。
 * 4. 触发即时归档（可选）：当 `runArchive` 为 true 时，针对时间条件超期的沙盒执行真正的归档处理。
 *
 * 完备性设计：迁移 API 只负责字段修正与执行结果汇总，真实归档流程复用核心 service，
 * 避免脚本层复制归档/恢复协议导致后续逻辑分叉。
 */
export async function migrateSandboxArchiveData(params: {
  runArchive?: boolean;
  inactiveDays?: number;
  inactiveBefore?: Date;
}): Promise<MigrationResult> {
  const startTime = Date.now();

  const realNow = new Date();
  let calculatedInactiveBefore = subDays(realNow, 7);

  if (params.inactiveBefore instanceof Date && !Number.isNaN(params.inactiveBefore.getTime())) {
    calculatedInactiveBefore = params.inactiveBefore;
  } else if (params.inactiveDays !== undefined) {
    calculatedInactiveBefore = subDays(realNow, params.inactiveDays);
  }

  logger.info('========================================');
  logger.info('Starting Sandbox Archive Data Migration');
  logger.info(`Run immediate archive: ${!!params.runArchive}`);
  logger.info(`Inactive boundary time: ${calculatedInactiveBefore.toISOString()}`);
  logger.info('========================================');

  // 1. 将 status 从 'stoped' 批量更新为 'stopped'
  logger.info("Updating sandbox status from 'stoped' to 'stopped'...");
  const statusUpdateResult = await MongoSandboxInstance.updateMany(
    { status: 'stoped' },
    { $set: { status: 'stopped' } }
  );
  logger.info(`Successfully updated status for ${statusUpdateResult.modifiedCount} records.`);

  // 2. 使用聚合管道高效补全 lastActiveAt 字段，规避 Node.js OOM
  logger.info('Filling missing lastActiveAt fields using database aggregation pipeline...');
  const lastActiveResult = await MongoSandboxInstance.updateMany(
    { lastActiveAt: { $exists: false } },
    [
      {
        $set: {
          lastActiveAt: { $ifNull: ['$createdAt', new Date()] }
        }
      }
    ]
  );
  logger.info(
    `Successfully filled lastActiveAt for ${lastActiveResult.modifiedCount} records (matched: ${lastActiveResult.matchedCount}).`
  );

  // 3. 将 upstream/main 写入的嵌套 edit-debug metadata 迁移为当前顶层字段
  logger.info('Migrating legacy edit-debug sandbox metadata fields...');
  const legacyEditDebugFilter = {
    type: SandboxTypeEnum.editDebug
  };
  const legacyMetadataFilter = {
    ...legacyEditDebugFilter,
    $or: [
      {
        'metadata.versionId': { $exists: false },
        'metadata.metadata.versionId': { $exists: true }
      },
      {
        'metadata.skillName': { $exists: false },
        'metadata.metadata.skillName': { $exists: true }
      }
    ]
  };
  const buildLegacyMetadataFieldExpression = (field: 'versionId' | 'skillName') => ({
    $cond: [
      { $ne: [{ $type: `$metadata.${field}` }, 'missing'] },
      `$metadata.${field}`,
      {
        $cond: [
          { $ne: [{ $type: `$metadata.metadata.${field}` }, 'missing'] },
          `$metadata.metadata.${field}`,
          '$$REMOVE'
        ]
      }
    ]
  });
  const legacyMetadataResult = await MongoSandboxInstance.updateMany(legacyMetadataFilter, [
    {
      $set: {
        'metadata.versionId': buildLegacyMetadataFieldExpression('versionId'),
        'metadata.skillName': buildLegacyMetadataFieldExpression('skillName')
      }
    },
    {
      $unset: 'metadata.metadata'
    }
  ]);
  logger.info('Successfully migrated legacy metadata fields', {
    legacyMetadataUpdatedCount: legacyMetadataResult.matchedCount,
    modifiedCount: legacyMetadataResult.modifiedCount
  });

  // 4. 执行冷归档并收集明确指标
  let archiveTriggered = false;
  let archiveResult: SandboxArchiveResult | null = null;
  let activeProvider: SandboxProviderType | undefined;

  if (params.runArchive) {
    activeProvider = getConfiguredSandboxProvider();
    logger.info(`Active Sandbox Provider: ${activeProvider}`);
    logger.info('Running immediate sandbox archiving task...');
    archiveTriggered = true;
    const archiveCandidateCount = await countSandboxArchiveCandidates({
      provider: activeProvider,
      inactiveBefore: calculatedInactiveBefore
    });
    const archiveStartTime = Date.now();

    logger.info('Sandbox archive candidates counted', {
      provider: activeProvider,
      inactiveBefore: calculatedInactiveBefore.toISOString(),
      total: archiveCandidateCount
    });

    archiveResult = await archiveSandboxResources({
      inactiveBefore: calculatedInactiveBefore,
      providers: [activeProvider],
      options: {
        ensureZipInSandbox: true,
        onProgress: (progress) => {
          const percent =
            archiveCandidateCount > 0
              ? Math.min(100, Math.round((progress.processedCount / archiveCandidateCount) * 100))
              : 100;

          logger.info('Sandbox archive progress', {
            provider: activeProvider,
            total: archiveCandidateCount,
            processed: progress.processedCount,
            success: progress.successCount,
            failed: progress.failCount,
            batchSize: progress.batchSize,
            percent,
            elapsedMs: Date.now() - archiveStartTime
          });

          progress.failures.forEach((failure) => {
            logger.error('Sandbox archive resource failed', {
              provider: activeProvider,
              sandboxId: failure.sandboxId,
              error: failure.error
            });
          });
        }
      }
    });
    await traceSandboxArchiveFailures({
      provider: activeProvider,
      archiveResult
    });

    logger.info('Archive task executed successfully', {
      archiveResult,
      elapsedMs: Date.now() - archiveStartTime
    });
  }

  const duration = Date.now() - startTime;
  logger.info('========================================');
  logger.info('Sandbox Archive Data Migration Completed!');
  logger.info(`Duration: ${duration}ms`);
  logger.info('========================================');

  return {
    statusUpdateCount: statusUpdateResult.modifiedCount,
    lastActiveUpdatedCount: lastActiveResult.modifiedCount,
    legacyMetadataUpdatedCount: legacyMetadataResult.matchedCount,
    archiveTriggered,
    archiveResult,
    duration,
    activeProvider
  };
}

export default NextAPI(async function handler(req) {
  // 仅限 Root 超级管理员证书鉴权执行
  await authCert({ req, authRoot: true });

  const { body } = parseApiInput({ req, bodySchema: InitSandboxArchiveBodySchema });

  const result = await migrateSandboxArchiveData({
    runArchive: body.runArchive,
    inactiveDays: body.inactiveDays,
    inactiveBefore: body.inactiveBefore
  });

  return result;
});
