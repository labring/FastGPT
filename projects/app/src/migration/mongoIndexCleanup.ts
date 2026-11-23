import {
  dropManagedMongoIndexIfExists,
  type ExpectedMongoIndexOptions
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

/**
 * 声明单条待按版本一次性清理的 MongoDB 废弃索引。
 *
 * 每一项必须显式给出 `key` 与完整 `options`（普通索引传 `{}`），
 * 清理器按 `name + key + 完整 options` 精确匹配删除，避免误删客户 DBA 同名自建索引。
 */
export type DeprecatedMongoIndexMigrationEntry = {
  collectionName: string;
  datasource: DbDatasource;
  indexName: string;
  key: Record<string, unknown>;
  options: ExpectedMongoIndexOptions;
  reason: string;
};

export type CreateMongoIndexCleanupMigrationOptions = {
  entries: readonly DeprecatedMongoIndexMigrationEntry[];
  mainClient?: Mongoose;
  logClient?: Mongoose;
  /** 仅用于测试覆盖 `MONGO_DEPRECATE_INDEX` 开关解析逻辑。 */
  isCleanupEnabled?: () => boolean;
};

const formatCleanupErrorMessage = (error: unknown, fallback: string): string =>
  getErrText(error, fallback).slice(0, systemMigrationLimits.maxErrorMessageLength) || fallback;

/**
 * 构建各版本通用的 MongoDB 废弃索引一次性清理迁移执行器（约定命名 `tasks/<version>/<YYYYMMDD>_cleanup_mongo_indexes`）。
 *
 * 恢复策略：采用「幂等全量重跑（不保存 checkpoint）」。
 * 原因：清理对象仅是确定且有界的索引元数据（不扫描业务文档），且 `dropManagedMongoIndexIfExists`
 * 天然幂等（已删项返回 `missing`，签名不符返回 `skipped_mismatch`）；任意重试或租约接管均可安全全量复核。
 */
export const createMongoIndexCleanupMigration = ({
  entries,
  mainClient = connectionMongo,
  logClient = connectionLogMongo,
  isCleanupEnabled = isMongoDeprecateIndexEnabled
}: CreateMongoIndexCleanupMigrationOptions) => {
  return async (context: SystemMigrationContext): Promise<SystemMigrationResultData> => {
    const totalCount = entries.length;
    const apply = isCleanupEnabled();

    // ==================== 阶段 1：清理废弃索引 ====================
    await context.reportProgress({
      key: 'cleanup',
      status: SystemMigrationStatusEnum.running,
      current: 0,
      total: totalCount
    });

    if (!apply) {
      context.logger.info(
        'MONGO_DEPRECATE_INDEX is disabled; skipping deprecated MongoDB index drops',
        { totalCount }
      );
    }

    let droppedCount = 0;
    let missingCount = 0;
    let skippedCount = 0;
    const cleanupFailures: SystemMigrationFailedRecord[] = [];

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      context.signal.throwIfAborted();
      await context.assertActive();

      const client = entry.datasource === 'log' ? logClient : mainClient;
      try {
        const result = await dropManagedMongoIndexIfExists({
          client,
          collectionName: entry.collectionName,
          indexName: entry.indexName,
          expectedKey: entry.key,
          expectedOptions: entry.options,
          apply
        });

        if (result.status === 'missing') {
          missingCount += 1;
        } else if (result.status === 'skipped_mismatch') {
          skippedCount += 1;
          context.logger.warn('Preserved MongoDB index due to definition mismatch', {
            collection: entry.collectionName,
            indexName: entry.indexName,
            datasource: entry.datasource,
            reason: result.reason
          });
        } else if (apply) {
          droppedCount += 1;
        } else {
          // MONGO_DEPRECATE_INDEX=false 时以只读 dry-run 探测：存在且匹配的废弃索引保留并计入跳过
          skippedCount += 1;
        }
      } catch (error) {
        context.signal.throwIfAborted();
        cleanupFailures.push({
          stageKey: 'cleanup',
          data: {
            collection: entry.collectionName,
            indexName: entry.indexName,
            datasource: entry.datasource
          },
          reason: {
            message: formatCleanupErrorMessage(error, 'Failed to drop deprecated MongoDB index')
          }
        });
        await context.reportFailedRecords([...cleanupFailures]);
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

        const client = entry.datasource === 'log' ? logClient : mainClient;
        try {
          const check = await dropManagedMongoIndexIfExists({
            client,
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
