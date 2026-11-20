import type { Mongoose } from 'mongoose';
import { DbConfigurationError } from '../errors';
import type { DbDatasource, DbLogger } from '../types';
import {
  deriveMongoIndexName,
  type MongoCollectionDefinition,
  type MongoCollectionIndexDef
} from './collection';

const MANAGED_INDEX_PREFIX = 'fg_';

const silentLogger: DbLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

export type MongoIndexSyncLock = {
  withLock: <T>(params: { key: string; label: string; fn: () => Promise<T> }) => Promise<T>;
};

export type LiveMongoIndexSpec = {
  name?: string;
  key?: Record<string, unknown>;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: unknown;
  collation?: Record<string, unknown>;
  weights?: Record<string, unknown>;
};

export type MongoIndexSyncReport = {
  created: Array<{ collection: string; indexName: string }>;
  skippedExisting: Array<{ collection: string; indexName: string; matchedLiveName: string }>;
  ttlUpdated: Array<{ collection: string; indexName: string; expireAfterSeconds: number }>;
  optionDriftWarnings: Array<{ collection: string; indexName: string; reason: string }>;
  errors: Array<{ collection: string; indexName: string; error: string }>;
};

export type MongoIndexInspectReport = {
  missingIndexes: Array<{ collection: string; indexName: string }>;
  optionMismatches: Array<{
    collection: string;
    indexName: string;
    liveName: string;
    reason: string;
  }>;
  extraManagedIndexes: Array<{ collection: string; indexName: string }>;
  legacyOrCustomerIndexes: Array<{ collection: string; indexName: string }>;
};

export type DropMongoIndexResult = {
  collection: string;
  indexName: string;
  status: 'dropped' | 'missing' | 'skipped_mismatch';
  reason?: string;
};

const normalizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) {
        sorted[key] = normalizeValue(entry);
      }
    }
    return sorted;
  }
  return value;
};

const deepEqualNormalized = (a: unknown, b: unknown): boolean =>
  JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b));

/**
 * 将 Mongo 索引 key（含带前导列的复合 `text` 索引 `_fts`/`_ftsx` + `weights`）归一化为可比对签名。
 */
const buildNormalizedMongoKeySignature = ({
  key,
  weights
}: {
  key: Record<string, unknown>;
  weights?: Record<string, unknown>;
}): string => {
  const entries = Object.entries(key);
  const nonTextPrefix: Array<[string, unknown]> = [];
  const textFields: string[] = [];

  for (const [field, order] of entries) {
    if (field === '_fts' || field === '_ftsx') {
      continue;
    }
    if (order === 'text') {
      textFields.push(field);
    } else {
      nonTextPrefix.push([field, order]);
    }
  }

  if (weights !== undefined && Object.keys(weights).length > 0) {
    for (const field of Object.keys(weights)) {
      if (!textFields.includes(field)) {
        textFields.push(field);
      }
    }
  }

  return JSON.stringify({
    ordered: nonTextPrefix,
    text: textFields.sort()
  });
};

const detectCriticalOptionDrift = ({
  declared,
  live
}: {
  declared: MongoCollectionIndexDef;
  live: LiveMongoIndexSpec;
}): string | undefined => {
  const opts = declared.options;
  const declaredUnique = Boolean(opts?.unique);
  if (declaredUnique !== Boolean(live.unique)) {
    return `unique mismatch (declared=${declaredUnique}, live=${Boolean(live.unique)})`;
  }
  const declaredSparse = Boolean(opts?.sparse);
  if (declaredSparse !== Boolean(live.sparse)) {
    return `sparse mismatch (declared=${declaredSparse}, live=${Boolean(live.sparse)})`;
  }
  if (
    opts?.expireAfterSeconds !== undefined &&
    live.expireAfterSeconds !== opts.expireAfterSeconds
  ) {
    return `expireAfterSeconds mismatch (declared=${opts.expireAfterSeconds}, live=${String(live.expireAfterSeconds)})`;
  }
  if (
    opts?.partialFilterExpression !== undefined &&
    !deepEqualNormalized(opts.partialFilterExpression, live.partialFilterExpression)
  ) {
    return 'partialFilterExpression mismatch';
  }
  if (opts?.collation !== undefined) {
    const liveLocale = live.collation?.locale;
    const declaredLocale = (opts.collation as unknown as Record<string, unknown>).locale;
    if (liveLocale !== declaredLocale) {
      return `collation locale mismatch (declared=${String(declaredLocale)}, live=${String(liveLocale)})`;
    }
  }
  return undefined;
};

const getMongoErrorCode = (error: unknown): number | undefined => {
  if (error === null || error === undefined || typeof error !== 'object') {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'number' ? code : undefined;
};

const listCollectionIndexesSafe = async (
  client: Mongoose,
  collectionName: string
): Promise<LiveMongoIndexSpec[]> => {
  const db = client.connection.db;
  if (db === undefined) {
    throw new DbConfigurationError('MongoDB connection is not established');
  }
  try {
    const indexes = await db.collection(collectionName).indexes();
    return indexes as LiveMongoIndexSpec[];
  } catch (error) {
    // 集合尚未建库时（NamespaceNotFound = 26）视为零索引
    if (getMongoErrorCode(error) === 26) {
      return [];
    }
    throw error;
  }
};

const resolveDesiredIndexes = (
  collection: MongoCollectionDefinition<any>
): readonly MongoCollectionIndexDef[] => {
  const dynamic = collection.resolveDynamicIndexes?.() ?? [];
  return [...collection.indexes, ...dynamic];
};

const sleepMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * MongoDB 后台异步「只增补建」索引同步器（绝不在启动期自动删除任何索引）。
 *
 * - 支持分布式锁（防多副本 Pod 启动惊群）；
 * - 按 key 等价语义比对现网索引（兼容带前导列的复合 `text` 索引与未带 `fg_` 前缀的存量冻结索引），
 *   彻底避免 Mongo Error 85（`IndexOptionsConflict`）；
 * - 遇到 Error 285（`IndexBuildAlreadyInProgress`）时按退避轮询等待而非崩溃；
 * - 可选 `allowCollModTtl: true` 时，对仅 `expireAfterSeconds` 漂移的 TTL 索引走 `collMod` 原地更新。
 */
export const syncMongoCollectionIndexes = async ({
  client,
  collections,
  datasource,
  lock,
  allowCollModTtl = false,
  max285Retries = 10,
  retryDelayMs = 1_000,
  logger = silentLogger
}: {
  client: Mongoose;
  collections: readonly MongoCollectionDefinition<any>[];
  datasource?: DbDatasource;
  lock?: MongoIndexSyncLock;
  allowCollModTtl?: boolean;
  max285Retries?: number;
  retryDelayMs?: number;
  logger?: DbLogger;
}): Promise<MongoIndexSyncReport> => {
  const targetCollections =
    datasource === undefined
      ? collections
      : collections.filter((col) => col.datasource === datasource);

  const runSync = async (): Promise<MongoIndexSyncReport> => {
    const db = client.connection.db;
    if (db === undefined) {
      throw new DbConfigurationError('MongoDB connection is not established');
    }

    const report: MongoIndexSyncReport = {
      created: [],
      skippedExisting: [],
      ttlUpdated: [],
      optionDriftWarnings: [],
      errors: []
    };

    for (const collection of targetCollections) {
      const desiredIndexes = resolveDesiredIndexes(collection);
      if (desiredIndexes.length === 0) {
        continue;
      }

      const liveIndexes = await listCollectionIndexesSafe(client, collection.name);
      const liveBySignature = new Map<string, LiveMongoIndexSpec>();
      for (const live of liveIndexes) {
        if (live.key === undefined) {
          continue;
        }
        const sig = buildNormalizedMongoKeySignature({
          key: live.key,
          weights: live.weights
        });
        liveBySignature.set(sig, live);
      }

      const nativeCollection = db.collection(collection.name);

      for (const declared of desiredIndexes) {
        const indexName = deriveMongoIndexName(declared);
        const desiredSig = buildNormalizedMongoKeySignature({
          key: declared.key as Record<string, unknown>
        });
        const matchedLive = liveBySignature.get(desiredSig);

        if (matchedLive !== undefined) {
          const liveName = matchedLive.name ?? indexName;
          const desiredTtl = declared.options?.expireAfterSeconds;

          if (
            allowCollModTtl &&
            desiredTtl !== undefined &&
            matchedLive.expireAfterSeconds !== undefined &&
            matchedLive.expireAfterSeconds !== desiredTtl
          ) {
            await db.command({
              collMod: collection.name,
              index: { name: liveName, expireAfterSeconds: desiredTtl }
            });
            report.ttlUpdated.push({
              collection: collection.name,
              indexName: liveName,
              expireAfterSeconds: desiredTtl
            });
            logger.info('Updated Mongo TTL index via collMod', {
              collection: collection.name,
              indexName: liveName,
              expireAfterSeconds: desiredTtl
            });
            continue;
          }

          const drift = detectCriticalOptionDrift({ declared, live: matchedLive });
          if (drift !== undefined) {
            report.optionDriftWarnings.push({
              collection: collection.name,
              indexName,
              reason: drift
            });
            logger.warn('Mongo index exists with option drift (not auto-dropped)', {
              collection: collection.name,
              indexName,
              liveName,
              reason: drift
            });
          }

          report.skippedExisting.push({
            collection: collection.name,
            indexName,
            matchedLiveName: liveName
          });
          continue;
        }

        // 只增补建：对 Error 285（IndexBuildAlreadyInProgress）按退避轮询等待，避免多副本启动冲突
        let createdOk = false;
        for (let attempt = 0; attempt <= max285Retries; attempt += 1) {
          try {
            const createOpts: Record<string, unknown> = {
              ...(declared.options as Record<string, unknown> | undefined),
              ...(declared.options?.unique !== undefined
                ? { unique: Boolean(declared.options.unique) }
                : {}),
              ...(declared.options?.name !== undefined ? { name: declared.options.name } : {})
            };
            await nativeCollection.createIndex(declared.key as any, createOpts as any);
            report.created.push({ collection: collection.name, indexName });
            createdOk = true;
            break;
          } catch (error) {
            const code = getMongoErrorCode(error);
            if (code === 285 && attempt < max285Retries) {
              logger.info('Mongo index build already in progress (285); waiting before retry', {
                collection: collection.name,
                indexName,
                attempt: attempt + 1
              });
              await sleepMs(retryDelayMs);
              continue;
            }
            if (code === 85 || code === 86) {
              report.optionDriftWarnings.push({
                collection: collection.name,
                indexName,
                reason: error instanceof Error ? error.message : String(error)
              });
              logger.warn('Mongo index conflict (85/86) skipped safely during additive sync', {
                collection: collection.name,
                indexName,
                code
              });
              createdOk = true;
              break;
            }
            report.errors.push({
              collection: collection.name,
              indexName,
              error: error instanceof Error ? error.message : String(error)
            });
            logger.error('Failed to create Mongo index during additive sync', {
              collection: collection.name,
              indexName,
              error
            });
            break;
          }
        }

        if (createdOk) {
          liveBySignature.set(desiredSig, {
            name: indexName,
            key: declared.key as Record<string, unknown>,
            ...(declared.options as LiveMongoIndexSpec | undefined)
          });
        }
      }
    }

    return report;
  };

  if (lock !== undefined) {
    return lock.withLock({
      key: `mongo-index-sync:${datasource ?? 'all'}`,
      label: `mongo-index-sync:${datasource ?? 'all'}`,
      fn: runSync
    });
  }

  return runSync();
};

/**
 * 显式一次性清理单个 Mongo 废弃索引（严禁在普通启动同步循环内调用）。
 *
 * 安全守卫（双保险保护客户 DBA 自建索引）：
 * - 对 `fg_*` 托管索引：允许按名称安全删除（若同时提供 `expectedKey` 也会校验）；
 * - 对无 `fg_` 前缀的存量历史索引：必须显式提供 `expectedKey`，且必须与现网 `name + key`（及关键 options）
 *   精确一致才执行删除，不匹配直接返回 `skipped_mismatch` 绝不误删。
 */
export const dropManagedMongoIndexIfExists = async ({
  client,
  collectionName,
  indexName,
  expectedKey,
  expectedOptions,
  apply = true
}: {
  client: Mongoose;
  collectionName: string;
  indexName: string;
  expectedKey?: Record<string, unknown>;
  expectedOptions?: Pick<
    LiveMongoIndexSpec,
    'unique' | 'sparse' | 'expireAfterSeconds' | 'partialFilterExpression'
  >;
  apply?: boolean;
}): Promise<DropMongoIndexResult> => {
  if (indexName === '_id_') {
    throw new DbConfigurationError('Cannot drop MongoDB primary _id_ index');
  }
  if (!indexName.startsWith(MANAGED_INDEX_PREFIX) && expectedKey === undefined) {
    throw new DbConfigurationError(
      `Refusing to drop non-fg_ Mongo index "${indexName}" on "${collectionName}" without explicit expectedKey verification`
    );
  }

  const db = client.connection.db;
  if (db === undefined) {
    throw new DbConfigurationError('MongoDB connection is not established');
  }

  const liveIndexes = await listCollectionIndexesSafe(client, collectionName);
  const live = liveIndexes.find((item) => item.name === indexName);
  if (live === undefined) {
    return { collection: collectionName, indexName, status: 'missing' };
  }

  if (expectedKey !== undefined) {
    const expectedSig = buildNormalizedMongoKeySignature({ key: expectedKey });
    const liveSig = buildNormalizedMongoKeySignature({
      key: live.key ?? {},
      weights: live.weights
    });
    if (expectedSig !== liveSig) {
      return {
        collection: collectionName,
        indexName,
        status: 'skipped_mismatch',
        reason: 'live index key does not match expectedKey'
      };
    }
  }

  if (expectedOptions !== undefined) {
    const drift = detectCriticalOptionDrift({
      declared: {
        key: (expectedKey ?? live.key ?? {}) as any,
        options: expectedOptions as any
      },
      live
    });
    if (drift !== undefined) {
      return {
        collection: collectionName,
        indexName,
        status: 'skipped_mismatch',
        reason: drift
      };
    }
  }

  if (!apply) {
    return {
      collection: collectionName,
      indexName,
      status: 'dropped',
      reason: 'dry-run'
    };
  }

  try {
    await db.collection(collectionName).dropIndex(indexName);
    return { collection: collectionName, indexName, status: 'dropped' };
  } catch (error) {
    // 27 = IndexNotFound, 26 = NamespaceNotFound
    const code = getMongoErrorCode(error);
    if (code === 27 || code === 26) {
      return { collection: collectionName, indexName, status: 'missing' };
    }
    throw error;
  }
};

/**
 * 100% 只读的 MongoDB 索引巡检器（绝不建索引也不删索引），与 `inspectSqlSchema` 语义镜像对齐。
 */
export const inspectMongoIndexes = async ({
  client,
  collections,
  datasource
}: {
  client: Mongoose;
  collections: readonly MongoCollectionDefinition<any>[];
  datasource?: DbDatasource;
}): Promise<MongoIndexInspectReport> => {
  const targetCollections =
    datasource === undefined
      ? collections
      : collections.filter((col) => col.datasource === datasource);

  const report: MongoIndexInspectReport = {
    missingIndexes: [],
    optionMismatches: [],
    extraManagedIndexes: [],
    legacyOrCustomerIndexes: []
  };

  for (const collection of targetCollections) {
    const desiredIndexes = resolveDesiredIndexes(collection);
    const liveIndexes = await listCollectionIndexesSafe(client, collection.name);

    const liveBySig = new Map<string, LiveMongoIndexSpec>();
    const matchedLiveNames = new Set<string>(['_id_']);

    for (const live of liveIndexes) {
      if (live.key === undefined) {
        continue;
      }
      liveBySig.set(
        buildNormalizedMongoKeySignature({ key: live.key, weights: live.weights }),
        live
      );
    }

    for (const declared of desiredIndexes) {
      const indexName = deriveMongoIndexName(declared);
      const sig = buildNormalizedMongoKeySignature({
        key: declared.key as Record<string, unknown>
      });
      const live = liveBySig.get(sig);

      if (live === undefined) {
        report.missingIndexes.push({ collection: collection.name, indexName });
        continue;
      }

      const liveName = live.name ?? indexName;
      matchedLiveNames.add(liveName);

      const drift = detectCriticalOptionDrift({ declared, live });
      if (drift !== undefined) {
        report.optionMismatches.push({
          collection: collection.name,
          indexName,
          liveName,
          reason: drift
        });
      }
    }

    for (const live of liveIndexes) {
      const liveName = live.name;
      if (liveName === undefined || matchedLiveNames.has(liveName)) {
        continue;
      }
      if (liveName.startsWith(MANAGED_INDEX_PREFIX)) {
        report.extraManagedIndexes.push({ collection: collection.name, indexName: liveName });
      } else {
        report.legacyOrCustomerIndexes.push({ collection: collection.name, indexName: liveName });
      }
    }
  }

  return report;
};
