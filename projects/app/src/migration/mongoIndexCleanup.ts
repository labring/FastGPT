import {
  dropManagedMongoIndexIfExists,
  hasMatchingMongoIndex,
  type ExpectedMongoIndexOptions,
  type MongoIndexRequirement
} from '@fastgpt/dal/db/mongo/indexSync';
import type { DbDatasource } from '@fastgpt/dal/db/types';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  systemMigrationLimits,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationResultData
} from '@fastgpt/global/migration/schema';
import { connectionLogMongo, connectionMongo, type Mongoose } from '@fastgpt/service/common/mongo';
import { isMongoDeprecateIndexEnabled } from '@fastgpt/service/common/mongo/indexManager';
import type { SystemMigrationContext } from './registry';

export const DEFAULT_PREREQUISITE_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_PREREQUISITE_WAIT_TIMEOUT_MS = 30 * 60 * 1_000;

/**
 * 声明单条待按版本一次性清理的 MongoDB 废弃索引。
 *
 * - 每一项必须显式给出 `key` 与完整 `options`（普通索引传 `{}`），按 `name + key + 完整 options`
 *   精确匹配删除，避免误删客户 DBA 同名自建索引；
 * - 若该旧索引由新索引替代，必须通过 `requiredIndexes` 声明前置替代索引签名；迁移任务会先确认所有
 *   替代索引已在现网 `listIndexes()` 就绪（未就绪时持续轮询跟踪），绝不在替代索引建完前删除旧索引。
 */
export type DeprecatedMongoIndexMigrationEntry = {
  collectionName: string;
  datasource: DbDatasource;
  indexName: string;
  key: Record<string, unknown>;
  options: ExpectedMongoIndexOptions;
  requiredIndexes?: readonly MongoIndexRequirement[];
  reason: string;
};

export type CreateMongoIndexCleanupMigrationOptions = {
  entries: readonly DeprecatedMongoIndexMigrationEntry[];
  mainClient?: Mongoose;
  logClient?: Mongoose;
  /** 仅用于测试覆盖 `MONGO_DEPRECATE_INDEX` 开关解析逻辑。 */
  isCleanupEnabled?: () => boolean;
  /** 等待前置替代索引就绪的轮询间隔（毫秒），默认 5 秒。 */
  pollIntervalMs?: number;
  /** 等待前置替代索引就绪的最长总时长（毫秒），超时后保留旧索引并失败待重试，默认 30 分钟。 */
  prerequisiteWaitTimeoutMs?: number;
};

const formatCleanupErrorMessage = (error: unknown, fallback: string): string =>
  getErrText(error, fallback).slice(0, systemMigrationLimits.maxErrorMessageLength) || fallback;

/** 支持 AbortSignal 的轮询等待，任务中止或租约丢失时立即唤醒，不阻塞进程退出。 */
const waitAbortable = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('Migration aborted while waiting for required indexes'));
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('Migration aborted while waiting for required indexes'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });

const areRequiredIndexesReady = async ({
  client,
  entry
}: {
  client: Mongoose;
  entry: DeprecatedMongoIndexMigrationEntry;
}): Promise<boolean> => {
  const requirements = entry.requiredIndexes;
  if (requirements === undefined || requirements.length === 0) {
    return true;
  }

  for (const requirement of requirements) {
    const ready = await hasMatchingMongoIndex({
      client,
      collectionName: entry.collectionName,
      key: requirement.key,
      options: requirement.options
    });
    if (!ready) {
      return false;
    }
  }
  return true;
};

/**
 * 构建各版本通用的 MongoDB 废弃索引一次性清理迁移执行器（约定命名 `tasks/<version>/<YYYYMMDD>_cleanup_mongo_indexes`）。
 *
 * 恢复策略：采用「幂等全量重跑（不保存 checkpoint）」。
 * 原因：清理对象仅是确定且有界的索引元数据（不扫描业务文档），且 `dropManagedMongoIndexIfExists`
 * 天然幂等（已删项返回 `missing`，签名不符返回 `skipped_mismatch`）；任意重试或租约接管均可安全全量复核。
 *
 * 前置就绪守卫：若旧索引存在且声明了 `requiredIndexes`，迁移脚本会在删除前持续轮询 `listIndexes()`
 * 跟踪前置替代索引是否构建完毕（MongoDB 构建中的索引不会出现在 `listIndexes()` 中）；全部就绪后立即删除，
 * 超时仍未就绪则保守保留旧索引并失败退出，待补建完成后可安全重试。
 */
export const createMongoIndexCleanupMigration = ({
  entries,
  mainClient = connectionMongo,
  logClient = connectionLogMongo,
  isCleanupEnabled = isMongoDeprecateIndexEnabled,
  pollIntervalMs = DEFAULT_PREREQUISITE_POLL_INTERVAL_MS,
  prerequisiteWaitTimeoutMs = DEFAULT_PREREQUISITE_WAIT_TIMEOUT_MS
}: CreateMongoIndexCleanupMigrationOptions) => {
  return async (context: SystemMigrationContext): Promise<SystemMigrationResultData> => {
    const totalCount = entries.length;
    const apply = isCleanupEnabled();

    const resolveClient = (datasource: DbDatasource): Mongoose =>
      datasource === 'log' ? logClient : mainClient;

    // ==================== 阶段 1：清理废弃索引 ====================
    await context.reportProgress({
      key: 'cleanup',
      status: SystemMigrationStatusEnum.running,
      current: 0,
      total: totalCount
    });

    let droppedCount = 0;
    let missingCount = 0;
    let skippedCount = 0;
    const cleanupFailures: SystemMigrationFailedRecord[] = [];

    const recordCleanupFailure = async (
      entry: DeprecatedMongoIndexMigrationEntry,
      message: string
    ) => {
      cleanupFailures.push({
        stageKey: 'cleanup',
        data: {
          collection: entry.collectionName,
          indexName: entry.indexName,
          datasource: entry.datasource
        },
        reason: { message }
      });
      await context.reportFailedRecords([...cleanupFailures]);
    };

    if (!apply) {
      context.logger.info(
        'MONGO_DEPRECATE_INDEX is disabled; inspecting deprecated MongoDB indexes without dropping',
        { totalCount }
      );

      for (const entry of entries) {
        context.signal.throwIfAborted();
        await context.assertActive();

        try {
          const probe = await dropManagedMongoIndexIfExists({
            client: resolveClient(entry.datasource),
            collectionName: entry.collectionName,
            indexName: entry.indexName,
            expectedKey: entry.key,
            expectedOptions: entry.options,
            apply: false
          });
          if (probe.status === 'missing') {
            missingCount += 1;
          } else if (probe.status === 'skipped_mismatch') {
            skippedCount += 1;
            context.logger.warn('Preserved MongoDB index due to definition mismatch', {
              collection: entry.collectionName,
              indexName: entry.indexName,
              datasource: entry.datasource,
              reason: probe.reason
            });
          } else {
            // 现网仍存在待退役的旧索引，但开关已关闭：不删除也不假成功，保留可执行/可重试状态待开启开关或手工清理后复验。
            await recordCleanupFailure(
              entry,
              'Skipped because MONGO_DEPRECATE_INDEX is disabled; enable it or drop manually and retry'
            );
          }
        } catch (error) {
          context.signal.throwIfAborted();
          await recordCleanupFailure(
            entry,
            formatCleanupErrorMessage(error, 'Failed to inspect deprecated MongoDB index')
          );
        }
      }

      if (cleanupFailures.length > 0) {
        await context.fail({
          message:
            'Deprecated MongoDB index cleanup is deferred while MONGO_DEPRECATE_INDEX is disabled',
          failedRecords: cleanupFailures
        });
      }
    } else {
      let completedCount = 0;
      let pendingEntries: DeprecatedMongoIndexMigrationEntry[] = [];

      /**
       * 单条尝试处理：
       * 1. 先只读探测旧索引是否存在且签名精确匹配（不存在或客户定制索引直接完结，不等待替代索引）；
       * 2. 若旧索引存在且匹配，校验声明的 `requiredIndexes` 已全部就绪；未就绪则返回 `'waiting'`；
       * 3. 前置全部就绪后执行精确删除。
       */
      const tryProcessEntry = async (
        entry: DeprecatedMongoIndexMigrationEntry
      ): Promise<'completed' | 'waiting'> => {
        const client = resolveClient(entry.datasource);
        const probe = await dropManagedMongoIndexIfExists({
          client,
          collectionName: entry.collectionName,
          indexName: entry.indexName,
          expectedKey: entry.key,
          expectedOptions: entry.options,
          apply: false
        });

        if (probe.status === 'missing') {
          missingCount += 1;
          return 'completed';
        }
        if (probe.status === 'skipped_mismatch') {
          skippedCount += 1;
          context.logger.warn('Preserved MongoDB index due to definition mismatch', {
            collection: entry.collectionName,
            indexName: entry.indexName,
            datasource: entry.datasource,
            reason: probe.reason
          });
          return 'completed';
        }

        const ready = await areRequiredIndexesReady({ client, entry });
        if (!ready) {
          return 'waiting';
        }

        const dropped = await dropManagedMongoIndexIfExists({
          client,
          collectionName: entry.collectionName,
          indexName: entry.indexName,
          expectedKey: entry.key,
          expectedOptions: entry.options,
          apply: true
        });
        if (dropped.status === 'dropped') {
          droppedCount += 1;
        } else if (dropped.status === 'missing') {
          missingCount += 1;
        } else {
          skippedCount += 1;
          context.logger.warn('Preserved MongoDB index due to definition mismatch', {
            collection: entry.collectionName,
            indexName: entry.indexName,
            datasource: entry.datasource,
            reason: dropped.reason
          });
        }
        return 'completed';
      };

      // 第一轮扫描：已满足前置或无需处理的条目立即完结，前置仍在构建的条目进入持续跟踪队列
      for (const entry of entries) {
        context.signal.throwIfAborted();
        await context.assertActive();

        try {
          const outcome = await tryProcessEntry(entry);
          if (outcome === 'completed') {
            completedCount += 1;
          } else {
            pendingEntries.push(entry);
          }
        } catch (error) {
          context.signal.throwIfAborted();
          await recordCleanupFailure(
            entry,
            formatCleanupErrorMessage(error, 'Failed to drop deprecated MongoDB index')
          );
        }
      }

      if (pendingEntries.length > 0) {
        await context.reportProgress({
          key: 'cleanup',
          status: SystemMigrationStatusEnum.running,
          current: completedCount,
          total: totalCount
        });
        context.logger.info(
          'Waiting for required replacement MongoDB indexes before dropping deprecated indexes',
          {
            pendingIndexes: pendingEntries.map(
              (item) => `${item.collectionName}.${item.indexName}`
            ),
            pollIntervalMs,
            timeoutMs: prerequisiteWaitTimeoutMs
          }
        );

        const deadline = Date.now() + Math.max(0, prerequisiteWaitTimeoutMs);
        while (pendingEntries.length > 0 && Date.now() < deadline) {
          const remainingMs = Math.max(0, deadline - Date.now());
          const sleepMs = Math.min(Math.max(1, pollIntervalMs), remainingMs);
          if (sleepMs > 0) {
            await waitAbortable(sleepMs, context.signal);
          }

          const nextPending: DeprecatedMongoIndexMigrationEntry[] = [];
          let progressed = false;

          for (const entry of pendingEntries) {
            context.signal.throwIfAborted();
            await context.assertActive();

            try {
              const outcome = await tryProcessEntry(entry);
              if (outcome === 'completed') {
                completedCount += 1;
                progressed = true;
              } else {
                nextPending.push(entry);
              }
            } catch (error) {
              context.signal.throwIfAborted();
              await recordCleanupFailure(
                entry,
                formatCleanupErrorMessage(error, 'Failed to drop deprecated MongoDB index')
              );
            }
          }

          pendingEntries = nextPending;
          if (progressed && pendingEntries.length > 0) {
            await context.reportProgress({
              key: 'cleanup',
              status: SystemMigrationStatusEnum.running,
              current: completedCount,
              total: totalCount
            });
          }
        }

        // 等待超时后仍未就绪：严禁删除旧索引，写入结构化失败记录以便管理员排障并在索引就绪后重试
        for (const entry of pendingEntries) {
          context.logger.warn(
            'Timed out waiting for required replacement MongoDB index; keeping legacy index',
            {
              collection: entry.collectionName,
              indexName: entry.indexName,
              datasource: entry.datasource
            }
          );
          await recordCleanupFailure(
            entry,
            'Required replacement MongoDB index is not ready yet; keeping legacy index'
          );
        }
      }
    }

    if (cleanupFailures.length > 0) {
      await context.fail({
        message: 'Some deprecated MongoDB indexes failed to clean up',
        failedRecords: cleanupFailures
      });
    }

    await context.reportProgress({
      key: 'cleanup',
      status: SystemMigrationStatusEnum.succeeded,
      current: totalCount,
      total: totalCount
    });

    // ==================== 阶段 2：校验清理结果 ====================
    await context.reportProgress({
      key: 'validation',
      status: SystemMigrationStatusEnum.running
    });

    if (apply) {
      const validationFailures: SystemMigrationFailedRecord[] = [];

      for (const entry of entries) {
        context.signal.throwIfAborted();
        await context.assertActive();

        try {
          const check = await dropManagedMongoIndexIfExists({
            client: resolveClient(entry.datasource),
            collectionName: entry.collectionName,
            indexName: entry.indexName,
            expectedKey: entry.key,
            expectedOptions: entry.options,
            apply: false
          });
          if (check.status === 'dropped') {
            validationFailures.push({
              stageKey: 'validation',
              data: {
                collection: entry.collectionName,
                indexName: entry.indexName,
                datasource: entry.datasource
              },
              reason: {
                message: 'Deprecated MongoDB index still exists after cleanup'
              }
            });
          }
        } catch (error) {
          context.signal.throwIfAborted();
          validationFailures.push({
            stageKey: 'validation',
            data: {
              collection: entry.collectionName,
              indexName: entry.indexName,
              datasource: entry.datasource
            },
            reason: {
              message: formatCleanupErrorMessage(
                error,
                'Failed to validate deprecated MongoDB index cleanup'
              )
            }
          });
        }
      }

      if (validationFailures.length > 0) {
        await context.fail({
          message: 'Deprecated MongoDB index cleanup validation failed',
          failedRecords: validationFailures
        });
      }
    }

    await context.reportProgress({
      key: 'validation',
      status: SystemMigrationStatusEnum.succeeded
    });

    return {
      totalCount,
      droppedCount,
      missingCount,
      skippedCount
    };
  };
};
