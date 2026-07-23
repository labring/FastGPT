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
  weights?: Record<string, unknown>;
  textIndexVersion?: number;
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

/**
 * MongoDB 索引管理入口。
 *
 * 每个 model 固定执行安全同步：补建当前 Schema 索引，再删除该 Schema 明确登记且
 * name + key 匹配的历史索引。Schema 外未知索引只记录不删除，以保护客户自建索引。
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
   * 只有 name 与 key 匹配时才允许删除；key 不匹配或未知索引均保留。text 索引会
   * 兼容 MongoDB 返回的 `_fts/_ftsx` 形态。`apply=false` 仅供诊断入口复用，启动
   * 同步固定传 true。
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

  /**
   * 判断声明 key 是否为 text 索引（字段值包含 `"text"`）。
   *
   * MongoDB 创建后会把 text 索引 key 改写为 `{ _fts: "text", _ftsx: 1 }`，
   * 因此清理匹配不能直接用声明 key 和 listIndexes 的 key 做对象相等比较。
   */
  private static isTextIndexDefinition(key: DeprecatedMongoIndexDefinition['key']) {
    return Object.values(key as Record<string, unknown>).some((value) => value === 'text');
  }

  /** 判断 listIndexes 返回的索引是否为 text 索引。 */
  private static isStoredTextIndex(index: MongoIndexDescription) {
    return (
      index.key?._fts === 'text' ||
      typeof index.textIndexVersion === 'number' ||
      (index.weights != null && typeof index.weights === 'object')
    );
  }

  /**
   * 从废弃声明中提取 text 字段列表，保持声明顺序。
   * 非 text 前缀/后缀字段暂不参与匹配，当前 FastGPT 未使用混合 text 复合索引。
   */
  private static getDeclaredTextFields(key: DeprecatedMongoIndexDefinition['key']) {
    return Object.entries(key as Record<string, unknown>)
      .filter(([, value]) => value === 'text')
      .map(([field]) => field);
  }

  /**
   * 从数据库索引描述中提取 text 字段列表。
   * 优先使用 `weights`（字段 -> 权重），这是 listIndexes 暴露业务字段的权威来源。
   */
  private static getStoredTextFields(index: MongoIndexDescription) {
    if (index.weights && typeof index.weights === 'object') {
      return Object.keys(index.weights);
    }
    return [];
  }

  /**
   * 废弃索引删除前的安全校验：name 已由调用方定位，这里只校验 key。
   *
   * - 普通索引：key 对象按声明顺序精确相等
   * - text 索引：声明字段集合与 weights 字段集合相等（忽略 `_fts/_ftsx` 形态差异）
   * - options（unique/sparse/TTL 等）不参与匹配，避免重复声明成本；同名同 key 下
   *   option 冲突极少，需由声明方自行确认
   */
  private static isDeprecatedIndexMatched({
    definition,
    index
  }: {
    definition: DeprecatedMongoIndexDefinition;
    index: MongoIndexDescription;
  }) {
    const definitionIsText = MongoIndexManager.isTextIndexDefinition(definition.key);
    const storedIsText = MongoIndexManager.isStoredTextIndex(index);

    if (definitionIsText || storedIsText) {
      if (!definitionIsText || !storedIsText) {
        return false;
      }

      // weights 字段顺序不一定等于声明顺序，按字段名集合比较即可
      return MongoIndexManager.isSameValue(
        [...MongoIndexManager.getDeclaredTextFields(definition.key)].sort(),
        [...MongoIndexManager.getStoredTextFields(index)].sort(),
        { sortObjectKeys: false }
      );
    }

    return MongoIndexManager.isSameValue(index.key, definition.key, { sortObjectKeys: false });
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
