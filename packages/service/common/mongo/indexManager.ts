import { getLogger, LogCategories } from '../logger';
import type { Connection, Model } from 'mongoose';
import {
  deprecatedMongoIndexes as defaultDeprecatedMongoIndexes,
  type DeprecatedMongoIndexDefinition
} from './deprecatedIndexes';
import type { serviceEnv } from '../../env';

const defaultLogger = getLogger(LogCategories.INFRA.MONGO);

type MongoIndexSyncMode = typeof serviceEnv.MONGO_INDEX_SYNC_MODE;

type MongoIndexLogger = {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
};

type MongooseDiffIndexesResult = {
  toDrop: string[];
  toCreate: unknown[];
};

export type MongoIndexSyncResult = {
  mode: MongoIndexSyncMode;
  modelName: string;
  collectionName: string;
  toDrop: string[];
  toCreate: unknown[];
};

export type MongoIndexDescription = {
  name?: string;
  key?: Record<string, unknown>;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: unknown;
  collation?: unknown;
};

type MongoIndexCollection = {
  indexes: () => Promise<MongoIndexDescription[]>;
  dropIndex: (indexName: string) => Promise<unknown>;
};

type MongoIndexDb = {
  collection: (collectionName: string) => MongoIndexCollection;
};

export type MongoIndexCleanupAction =
  | 'drop'
  | 'skip_missing'
  | 'skip_mismatch'
  | 'skip_missing_replacement'
  | 'error';

export type MongoIndexCleanupReportItem = {
  collectionName: string;
  indexName: string;
  action: MongoIndexCleanupAction;
  applied: boolean;
  reason: string;
  deprecatedVersion: string;
  replacementIndexNames?: string[];
  missingReplacementIndexNames?: string[];
  error?: string;
};

export type MongoIndexCleanupReport = {
  apply: boolean;
  items: MongoIndexCleanupReportItem[];
};

export type MongoIndexCleanupSummary = {
  total: number;
  dropped: number;
  droppable: number;
  skippedMissing: number;
  skippedMismatch: number;
  skippedMissingReplacement: number;
  errors: number;
};

type RunModelIndexModeParams = {
  model: Model<any>;
  mode: MongoIndexSyncMode;
  logger?: MongoIndexLogger;
};

type RunDeprecatedIndexCleanupOnceParams = {
  db: MongoIndexDb;
  cleanupKey: string;
  apply: boolean;
  indexes?: DeprecatedMongoIndexDefinition[];
  logger?: MongoIndexLogger;
};

const optionKeys = [
  'unique',
  'sparse',
  'expireAfterSeconds',
  'partialFilterExpression',
  'collation'
] as const;

/**
 * MongoDB 索引管理入口。
 *
 * 默认启动期只负责非破坏性补建 schema 索引；只有显式 `sync` 模式才会额外清理
 * `deprecatedIndexes` 中登记的 FastGPT 历史旧索引，避免普通服务重启误删客户自建索引。
 */
export class MongoIndexManager {
  private static modelIndexTasks = new Map<Model<any>, Promise<MongoIndexSyncResult>>();
  private static deprecatedCleanupTasks = new Map<string, Promise<MongoIndexCleanupReport>>();

  private static getCollectionName(model: Model<any>) {
    return model.collection.collectionName;
  }

  /**
   * 只计算当前 schema 和数据库索引的差异，不创建也不删除任何索引。
   *
   * `toDrop` 只表示 Mongoose 认为 schema 外存在的索引。默认安全模式下这些索引
   * 只会被记录为未知索引，不会删除，以保护客户自建索引。
   */
  static async inspectModelIndexes(
    model: Model<any>
  ): Promise<Pick<MongoIndexSyncResult, 'modelName' | 'collectionName' | 'toDrop' | 'toCreate'>> {
    const diff = (await model.diffIndexes({
      indexOptionsToCreate: true
    })) as MongooseDiffIndexesResult;

    return {
      modelName: model.modelName,
      collectionName: MongoIndexManager.getCollectionName(model),
      toDrop: diff.toDrop,
      toCreate: diff.toCreate
    };
  }

  /**
   * 按配置模式处理单个 Mongoose model 的索引。
   *
   * 默认 `create` 只创建 schema 中缺失的索引，并保留所有 schema 外索引。
   * `sync` 在 model 级别仍只创建缺失索引；废弃索引由连接初始化流程全局清理一次。
   */
  static async runModelIndexMode(params: RunModelIndexModeParams): Promise<MongoIndexSyncResult> {
    const existingTask = MongoIndexManager.modelIndexTasks.get(params.model);
    if (existingTask) {
      return existingTask;
    }

    const task = MongoIndexManager.runModelIndexModeInner(params);

    MongoIndexManager.modelIndexTasks.set(params.model, task);

    try {
      return await task;
    } finally {
      if (MongoIndexManager.modelIndexTasks.get(params.model) === task) {
        MongoIndexManager.modelIndexTasks.delete(params.model);
      }
    }
  }

  /**
   * 等待指定 Mongoose 连接上已经登记的 model 索引任务结束。
   *
   * 全局清理废弃索引前必须先等待替代索引创建完成，否则可能因 replacement 尚不存在而跳过清理。
   */
  static async waitForModelIndexTasks(connection: Connection): Promise<void> {
    while (true) {
      const tasks = [...MongoIndexManager.modelIndexTasks.entries()]
        .filter(([model]) => model.db === connection)
        .map(([, task]) => task);

      if (tasks.length === 0) {
        return;
      }

      await Promise.allSettled(tasks);
    }
  }

  /**
   * 对同一个 MongoDB 连接全局执行一次废弃索引清理。
   *
   * 清理范围只来自 deprecated registry；重复调用会复用首次任务，不会再次扫描或删除。
   */
  static async runDeprecatedIndexCleanupOnce({
    db,
    cleanupKey,
    apply,
    indexes = defaultDeprecatedMongoIndexes,
    logger = defaultLogger
  }: RunDeprecatedIndexCleanupOnceParams): Promise<MongoIndexCleanupReport> {
    const existingTask = MongoIndexManager.deprecatedCleanupTasks.get(cleanupKey);
    if (existingTask) {
      logger.debug('MongoDB deprecated index cleanup skipped', {
        cleanupKey,
        reason: 'already_started_or_completed'
      });
      return existingTask;
    }

    const task = MongoIndexManager.cleanupDeprecatedIndexes({
      db,
      apply,
      indexes,
      logger
    });
    MongoIndexManager.deprecatedCleanupTasks.set(cleanupKey, task);

    const report = await task;
    logger.info('MongoDB deprecated index cleanup finished', {
      cleanupKey,
      apply,
      summary: MongoIndexManager.summarizeCleanupReport(report)
    });
    return report;
  }

  /** 生成不包含凭据的连接级 cleanup 去重键。 */
  static getConnectionCleanupKey(connection: Connection): string {
    return [connection.host, connection.port, connection.name].filter(Boolean).join(':');
  }

  private static async runModelIndexModeInner({
    model,
    mode,
    logger = defaultLogger
  }: RunModelIndexModeParams): Promise<MongoIndexSyncResult> {
    const collectionName = MongoIndexManager.getCollectionName(model);
    const baseResult = {
      mode,
      modelName: model.modelName,
      collectionName,
      toDrop: [],
      toCreate: []
    } satisfies MongoIndexSyncResult;

    if (mode === 'off') {
      logger.debug('MongoDB index management skipped', {
        ...MongoIndexManager.buildIndexModeLogData(baseResult),
        reason: 'mode_off'
      });
      return baseResult;
    }

    const inspection = await MongoIndexManager.inspectModelIndexes(model);
    const result: MongoIndexSyncResult = {
      ...baseResult,
      toDrop: inspection.toDrop,
      toCreate: inspection.toCreate
    };

    logger.debug('MongoDB index diff inspected', {
      ...MongoIndexManager.buildIndexModeLogData(result),
      schemaExternalIndexNames: result.toDrop,
      toCreate: result.toCreate
    });

    if (result.toDrop.length > 0) {
      logger.warn('Detected MongoDB indexes not declared by FastGPT schema', {
        ...MongoIndexManager.buildIndexModeLogData(result),
        schemaExternalIndexNames: result.toDrop,
        cleanupPolicy: 'only_registered_deprecated_indexes_can_be_dropped'
      });
    }

    if (mode === 'dryRun') {
      logger.info(
        'MongoDB index dry-run completed',
        MongoIndexManager.buildIndexModeLogData(result)
      );
      return result;
    }

    if (mode === 'sync') {
      logger.info('MongoDB managed index sync started', {
        ...MongoIndexManager.buildIndexModeLogData(result),
        cleanupPolicy: 'deprecated_indexes_are_cleaned_once_per_connection'
      });
      logger.debug('MongoDB managed index sync detail', {
        ...MongoIndexManager.buildIndexModeLogData(result),
        schemaExternalIndexNames: result.toDrop,
        toCreate: result.toCreate,
        cleanupPolicy: 'deprecated_indexes_are_cleaned_once_per_connection'
      });

      await model.createIndexes({ background: true });

      logger.info('MongoDB managed index sync completed', {
        ...MongoIndexManager.buildIndexModeLogData(result),
        cleanupPolicy: 'deprecated_indexes_are_cleaned_once_per_connection'
      });

      return result;
    }

    await model.createIndexes({ background: true });

    logger.info('MongoDB schema indexes ensured', MongoIndexManager.buildIndexModeLogData(result));
    logger.debug('MongoDB schema index ensure detail', {
      ...MongoIndexManager.buildIndexModeLogData(result),
      schemaExternalIndexNames: result.toDrop,
      toCreate: result.toCreate
    });

    return result;
  }

  /**
   * 清理 FastGPT 明确登记的废弃 MongoDB 索引。
   *
   * 默认 dry-run 只输出计划；只有 `apply=true` 且 registry 与数据库索引精确匹配时才会删除。
   * schema 外未知索引不在本函数处理范围内，避免误删客户自建索引。
   */
  static async cleanupDeprecatedIndexes({
    db,
    apply,
    indexes = defaultDeprecatedMongoIndexes,
    logger
  }: {
    db: MongoIndexDb;
    apply: boolean;
    indexes?: DeprecatedMongoIndexDefinition[];
    logger?: MongoIndexLogger;
  }): Promise<MongoIndexCleanupReport> {
    const items: MongoIndexCleanupReportItem[] = [];

    if (indexes.length === 0) {
      return {
        apply,
        items
      };
    }

    logger?.debug('MongoDB deprecated index cleanup started', {
      apply,
      deprecatedIndexCount: indexes.length
    });

    for (const definition of indexes) {
      try {
        const collection = db.collection(definition.collectionName);
        const currentIndexes = await collection.indexes().catch((error) => {
          if (MongoIndexManager.isNamespaceNotFoundError(error)) {
            return [];
          }
          throw error;
        });
        const targetIndex = currentIndexes.find((index) => index.name === definition.indexName);

        if (!targetIndex) {
          const item = MongoIndexManager.buildCleanupItem({
            definition,
            action: 'skip_missing',
            reason: 'Deprecated index does not exist'
          });
          logger?.debug('Deprecated MongoDB index does not exist', item);
          items.push(item);
          continue;
        }

        if (!MongoIndexManager.isDeprecatedIndexMatched({ definition, index: targetIndex })) {
          const item = MongoIndexManager.buildCleanupItem({
            definition,
            action: 'skip_mismatch',
            reason: 'Index definition does not match deprecated registry entry'
          });
          logger?.warn('Skip deprecated MongoDB index cleanup because definition mismatched', {
            ...item,
            expectedKey: definition.key,
            actualKey: targetIndex.key,
            expectedOptions: MongoIndexManager.getExpectedOptions(definition),
            actualOptions: MongoIndexManager.getActualOptions(targetIndex)
          });
          items.push(item);
          continue;
        }

        const replacementIndexNames = definition.replacementIndexNames ?? [];
        const missingReplacementIndexNames = replacementIndexNames.filter(
          (indexName) => !currentIndexes.some((index) => index.name === indexName)
        );

        if (missingReplacementIndexNames.length > 0) {
          const item = MongoIndexManager.buildCleanupItem({
            definition,
            action: 'skip_missing_replacement',
            reason: 'Replacement index does not exist',
            missingReplacementIndexNames
          });
          logger?.warn(
            'Skip deprecated MongoDB index cleanup because replacement is missing',
            item
          );
          items.push(item);
          continue;
        }

        if (apply) {
          await collection.dropIndex(definition.indexName);
        }

        const item = MongoIndexManager.buildCleanupItem({
          definition,
          action: 'drop',
          applied: apply,
          reason: apply ? 'Deprecated index dropped' : 'Deprecated index can be dropped'
        });
        if (apply) {
          logger?.info('Dropped deprecated MongoDB index', item);
        } else {
          logger?.debug('Deprecated MongoDB index can be dropped', item);
        }
        items.push(item);
      } catch (error) {
        const item = MongoIndexManager.buildCleanupItem({
          definition,
          action: 'error',
          reason: 'Failed to inspect or cleanup deprecated index',
          error: MongoIndexManager.getErrorMessage(error)
        });
        logger?.error('Failed to cleanup deprecated MongoDB index', item);
        items.push(item);
      }
    }

    logger?.debug('MongoDB deprecated index cleanup completed', {
      apply,
      summary: MongoIndexManager.summarizeCleanupReport({ apply, items })
    });

    return {
      apply,
      items
    };
  }

  static summarizeCleanupReport(report: MongoIndexCleanupReport): MongoIndexCleanupSummary {
    return report.items.reduce<MongoIndexCleanupSummary>(
      (summary, item) => {
        summary.total += 1;

        if (item.action === 'drop' && item.applied) {
          summary.dropped += 1;
        } else if (item.action === 'drop') {
          summary.droppable += 1;
        } else if (item.action === 'skip_missing') {
          summary.skippedMissing += 1;
        } else if (item.action === 'skip_mismatch') {
          summary.skippedMismatch += 1;
        } else if (item.action === 'skip_missing_replacement') {
          summary.skippedMissingReplacement += 1;
        } else if (item.action === 'error') {
          summary.errors += 1;
        }

        return summary;
      },
      {
        total: 0,
        dropped: 0,
        droppable: 0,
        skippedMissing: 0,
        skippedMismatch: 0,
        skippedMissingReplacement: 0,
        errors: 0
      }
    );
  }

  static formatCleanupReport(report: MongoIndexCleanupReport) {
    const lines = [
      `MongoDB deprecated index cleanup ${report.apply ? 'apply' : 'dry-run'} report`,
      `Total: ${report.items.length}`
    ];

    for (const item of report.items) {
      lines.push(
        [
          `- [${item.action}]`,
          item.applied ? 'applied' : 'not-applied',
          `${item.collectionName}.${item.indexName}`,
          `version=${item.deprecatedVersion}`,
          `reason=${item.reason}`,
          item.replacementIndexNames?.length
            ? `replacement=${item.replacementIndexNames.join(',')}`
            : undefined,
          item.missingReplacementIndexNames?.length
            ? `missingReplacement=${item.missingReplacementIndexNames.join(',')}`
            : undefined,
          item.error ? `error=${item.error}` : undefined
        ]
          .filter(Boolean)
          .join(' ')
      );
    }

    return lines.join('\n');
  }

  private static buildIndexModeLogData(result: MongoIndexSyncResult) {
    return {
      mode: result.mode,
      modelName: result.modelName,
      collectionName: result.collectionName,
      toCreateCount: result.toCreate.length,
      schemaExternalIndexCount: result.toDrop.length
    };
  }

  private static normalizeForCompare(
    value: unknown,
    { sortObjectKeys }: { sortObjectKeys: boolean }
  ): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => MongoIndexManager.normalizeForCompare(item, { sortObjectKeys }));
    }

    if (value && typeof value === 'object') {
      const keys = Object.keys(value as Record<string, unknown>);
      const orderedKeys = sortObjectKeys ? keys.sort() : keys;

      return orderedKeys.reduce<Record<string, unknown>>((result, key) => {
        result[key] = MongoIndexManager.normalizeForCompare(
          (value as Record<string, unknown>)[key],
          { sortObjectKeys }
        );
        return result;
      }, {});
    }

    return value;
  }

  private static isSameValue(
    left: unknown,
    right: unknown,
    { sortObjectKeys = true }: { sortObjectKeys?: boolean } = {}
  ) {
    return (
      JSON.stringify(MongoIndexManager.normalizeForCompare(left, { sortObjectKeys })) ===
      JSON.stringify(MongoIndexManager.normalizeForCompare(right, { sortObjectKeys }))
    );
  }

  private static getExpectedOptions(definition: DeprecatedMongoIndexDefinition) {
    return optionKeys.reduce<Record<string, unknown>>((result, key) => {
      const value = definition.options?.[key];
      if (value !== undefined) {
        result[key] = value;
      }
      return result;
    }, {});
  }

  private static getActualOptions(index: MongoIndexDescription) {
    return optionKeys.reduce<Record<string, unknown>>((result, key) => {
      const value = index[key];
      if (value !== undefined) {
        result[key] = value;
      }
      return result;
    }, {});
  }

  private static isDeprecatedIndexMatched({
    definition,
    index
  }: {
    definition: DeprecatedMongoIndexDefinition;
    index: MongoIndexDescription;
  }) {
    if (!MongoIndexManager.isSameValue(index.key, definition.key, { sortObjectKeys: false })) {
      return false;
    }

    return MongoIndexManager.isSameValue(
      MongoIndexManager.getActualOptions(index),
      MongoIndexManager.getExpectedOptions(definition)
    );
  }

  private static buildCleanupItem({
    definition,
    action,
    applied = false,
    reason,
    missingReplacementIndexNames,
    error
  }: {
    definition: DeprecatedMongoIndexDefinition;
    action: MongoIndexCleanupAction;
    applied?: boolean;
    reason: string;
    missingReplacementIndexNames?: string[];
    error?: string;
  }): MongoIndexCleanupReportItem {
    return {
      collectionName: definition.collectionName,
      indexName: definition.indexName,
      action,
      applied,
      reason,
      deprecatedVersion: definition.deprecatedVersion,
      replacementIndexNames: definition.replacementIndexNames,
      missingReplacementIndexNames,
      error
    };
  }

  private static getErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private static isNamespaceNotFoundError(error: unknown) {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const { codeName, message } = error as { codeName?: string; message?: string };
    return codeName === 'NamespaceNotFound' || message?.includes('ns does not exist') === true;
  }
}
