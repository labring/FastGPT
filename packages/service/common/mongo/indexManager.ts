import { getLogger, LogCategories } from '../logger';
import type { Model } from 'mongoose';
import { getDeprecatedIndexes, type DeprecatedMongoIndexDefinition } from './schemaIndexes';

const defaultLogger = getLogger(LogCategories.INFRA.MONGO);

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
  modelName: string;
  collectionName: string;
  toDrop: string[];
  toCreate: unknown[];
  cleanupReport: MongoIndexCleanupReport;
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

export type MongoIndexCleanupAction = 'drop' | 'skip_missing' | 'skip_mismatch' | 'error';

export type MongoIndexCleanupReportItem = {
  collectionName: string;
  indexName: string;
  action: MongoIndexCleanupAction;
  applied: boolean;
  reason: string;
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
  errors: number;
};

type SyncModelIndexesParams = {
  model: Model<any>;
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
 * 每个 model 固定执行安全同步：补建当前 Schema 索引，再删除该 Schema 明确登记且
 * 精确匹配的历史索引。Schema 外未知索引只记录不删除，以保护客户自建索引。
 */
export class MongoIndexManager {
  private static modelIndexTasks = new Map<Model<any>, Promise<MongoIndexSyncResult>>();

  private static getCollectionName(model: Model<any>) {
    return model.collection.collectionName;
  }

  /**
   * 只计算当前 Schema 和数据库索引的差异，不创建也不删除任何索引。
   *
   * `toDrop` 仅表示 Mongoose 认为 Schema 外存在的索引，不能直接作为删除清单。
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
   * 主动同步单个 Model 的索引。
   *
   * 当前索引必须先创建成功，之后才会清理 Schema 本地登记的废弃索引。同一进程内
   * 针对同一个 Model 的并发调用复用进行中的任务，完成后允许重连或热加载再次检查。
   */
  static async syncModelIndexes(params: SyncModelIndexesParams): Promise<MongoIndexSyncResult> {
    const existingTask = MongoIndexManager.modelIndexTasks.get(params.model);
    if (existingTask) {
      return existingTask;
    }

    const task = MongoIndexManager.syncModelIndexesInner(params);
    MongoIndexManager.modelIndexTasks.set(params.model, task);

    try {
      return await task;
    } finally {
      if (MongoIndexManager.modelIndexTasks.get(params.model) === task) {
        MongoIndexManager.modelIndexTasks.delete(params.model);
      }
    }
  }

  private static async syncModelIndexesInner({
    model,
    logger = defaultLogger
  }: SyncModelIndexesParams): Promise<MongoIndexSyncResult> {
    const inspection = await MongoIndexManager.inspectModelIndexes(model);

    if (inspection.toDrop.length > 0) {
      logger.warn('Detected MongoDB indexes not declared by FastGPT schema', {
        collectionName: inspection.collectionName,
        indexNames: inspection.toDrop
      });
    }

    await model.createIndexes({ background: true });

    const cleanupReport = await MongoIndexManager.cleanupModelDeprecatedIndexes({
      model,
      apply: true,
      logger
    });
    const result: MongoIndexSyncResult = {
      ...inspection,
      cleanupReport
    };
    const cleanupSummary = MongoIndexManager.summarizeCleanupReport(cleanupReport);

    if (inspection.toCreate.length > 0 || cleanupSummary.dropped > 0) {
      logger.info('MongoDB indexes synchronized', {
        collectionName: inspection.collectionName,
        created: inspection.toCreate.length,
        dropped: cleanupSummary.dropped
      });
    }

    return result;
  }

  /**
   * 清理当前 Model 所属 Schema 明确登记的废弃索引。
   *
   * 只有 name、key 和关键 options 精确匹配时才允许删除；定义不匹配或未知索引均
   * 保留。`apply=false` 仅供诊断入口复用，启动同步固定传 true。
   */
  static async cleanupModelDeprecatedIndexes({
    model,
    apply,
    logger
  }: {
    model: Model<any>;
    apply: boolean;
    logger?: MongoIndexLogger;
  }): Promise<MongoIndexCleanupReport> {
    const collectionName = MongoIndexManager.getCollectionName(model);
    const definitions = getDeprecatedIndexes(model.schema);
    const items: MongoIndexCleanupReportItem[] = [];

    if (definitions.length === 0) {
      return { apply, items };
    }

    for (const definition of definitions) {
      try {
        const currentIndexes = (await model.collection.indexes().catch((error) => {
          if (MongoIndexManager.isNamespaceNotFoundError(error)) {
            return [];
          }
          throw error;
        })) as MongoIndexDescription[];
        const targetIndex = currentIndexes.find((index) => index.name === definition.indexName);

        if (!targetIndex) {
          const item = MongoIndexManager.buildCleanupItem({
            collectionName,
            definition,
            action: 'skip_missing',
            reason: 'Deprecated index does not exist'
          });
          items.push(item);
          continue;
        }

        if (!MongoIndexManager.isDeprecatedIndexMatched({ definition, index: targetIndex })) {
          const item = MongoIndexManager.buildCleanupItem({
            collectionName,
            definition,
            action: 'skip_mismatch',
            reason: 'Index definition does not match Schema declaration'
          });
          logger?.warn('Deprecated MongoDB index definition mismatched', {
            collectionName,
            indexName: definition.indexName
          });
          items.push(item);
          continue;
        }

        if (apply) {
          try {
            await model.collection.dropIndex(definition.indexName);
          } catch (error) {
            if (MongoIndexManager.isIndexNotFoundError(error)) {
              const item = MongoIndexManager.buildCleanupItem({
                collectionName,
                definition,
                action: 'skip_missing',
                reason: 'Deprecated index was already removed'
              });
              items.push(item);
              continue;
            }
            throw error;
          }
        }

        const item = MongoIndexManager.buildCleanupItem({
          collectionName,
          definition,
          action: 'drop',
          applied: apply,
          reason: apply ? 'Deprecated index dropped' : 'Deprecated index can be dropped'
        });
        items.push(item);
      } catch (error) {
        const item = MongoIndexManager.buildCleanupItem({
          collectionName,
          definition,
          action: 'error',
          reason: 'Failed to inspect or cleanup deprecated index',
          error: MongoIndexManager.getErrorMessage(error)
        });
        logger?.error('Failed to cleanup deprecated MongoDB index', {
          collectionName,
          indexName: definition.indexName,
          error: item.error
        });
        items.push(item);
      }
    }

    return { apply, items };
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
          `reason=${item.reason}`,
          item.error ? `error=${item.error}` : undefined
        ]
          .filter(Boolean)
          .join(' ')
      );
    }

    return lines.join('\n');
  }

  private static normalizeForCompare(
    value: unknown,
    { sortObjectKeys }: { sortObjectKeys: boolean }
  ): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => MongoIndexManager.normalizeForCompare(item, { sortObjectKeys }));
    }

    if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      const orderedKeys = sortObjectKeys ? keys.sort() : keys;

      return orderedKeys.reduce<Record<string, unknown>>((result, key) => {
        result[key] = MongoIndexManager.normalizeForCompare(Reflect.get(value, key), {
          sortObjectKeys
        });
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
    collectionName,
    definition,
    action,
    applied = false,
    reason,
    error
  }: {
    collectionName: string;
    definition: DeprecatedMongoIndexDefinition;
    action: MongoIndexCleanupAction;
    applied?: boolean;
    reason: string;
    error?: string;
  }): MongoIndexCleanupReportItem {
    return {
      collectionName,
      indexName: definition.indexName,
      action,
      applied,
      reason,
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

    const codeName = Reflect.get(error, 'codeName');
    const message = Reflect.get(error, 'message');
    return (
      codeName === 'NamespaceNotFound' ||
      (typeof message === 'string' && message.includes('ns does not exist'))
    );
  }

  private static isIndexNotFoundError(error: unknown) {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const code = Reflect.get(error, 'code');
    const codeName = Reflect.get(error, 'codeName');
    return code === 27 || codeName === 'IndexNotFound';
  }
}
