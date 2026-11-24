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

export type LiveMongoIndexSpec = {
  name?: string;
  key?: Record<string, unknown>;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: unknown;
  collation?: Record<string, unknown>;
  weights?: Record<string, unknown>;
  default_language?: string;
  language_override?: string;
  textIndexVersion?: number;
};

export type ExpectedMongoIndexOptions = Pick<
  LiveMongoIndexSpec,
  | 'unique'
  | 'sparse'
  | 'expireAfterSeconds'
  | 'partialFilterExpression'
  | 'collation'
  | 'weights'
  | 'default_language'
  | 'language_override'
>;

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

export type MongoIndexRequirement = {
  key: Record<string, unknown>;
  /** 显式声明替代索引的预期选项签名（普通索引可省略或传 `{}`），防止受限 partial/unique 索引误判为已就绪的全量替代索引。 */
  options?: ExpectedMongoIndexOptions;
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

const isTextIndexSpec = ({
  key,
  weights,
  textIndexVersion
}: {
  key: Record<string, unknown>;
  weights?: Record<string, unknown>;
  textIndexVersion?: number;
}): boolean =>
  key._fts === 'text' ||
  typeof textIndexVersion === 'number' ||
  (weights !== undefined && Object.keys(weights).length > 0) ||
  Object.values(key).some((order) => order === 'text');

/**
 * 将 MongoDB `collation` 归一化为可比对结构。
 *
 * 忽略服务端 ICU `version` 元数据，并补齐 MongoDB 文档默认项；未配置或 `locale === 'simple'`
 * 统一归一化为 `undefined`，确保声明态与 `listIndexes()` 返回态双向严格等价。
 */
const normalizeCollation = (collation: unknown): Record<string, unknown> | undefined => {
  if (collation === undefined || collation === null || typeof collation !== 'object') {
    return undefined;
  }
  const raw = collation as Record<string, unknown>;
  if (typeof raw.locale !== 'string' || raw.locale.trim().length === 0 || raw.locale === 'simple') {
    return undefined;
  }

  const { version: _ignoredVersion, ...rest } = raw;
  return normalizeValue({
    caseLevel: false,
    caseFirst: 'off',
    strength: 3,
    numericOrdering: false,
    alternate: 'non-ignorable',
    maxVariable: 'punct',
    normalization: false,
    backwards: false,
    ...rest
  }) as Record<string, unknown>;
};

/**
 * 归一化 text 索引权重映射；非 text 索引返回 `undefined`。
 */
const normalizeTextWeights = ({
  key,
  weights,
  textIndexVersion
}: {
  key: Record<string, unknown>;
  weights?: Record<string, unknown>;
  textIndexVersion?: number;
}): Record<string, number> | undefined => {
  if (!isTextIndexSpec({ key, weights, textIndexVersion })) {
    return undefined;
  }

  const normalized: Record<string, number> = {};
  for (const [field, order] of Object.entries(key)) {
    if (order === 'text' && field !== '_fts') {
      normalized[field] = 1;
    }
  }
  if (weights !== undefined) {
    for (const [field, weight] of Object.entries(weights)) {
      if (weight !== undefined) {
        normalized[field] = Number(weight);
      }
    }
  }

  return normalizeValue(normalized) as Record<string, number>;
};

/**
 * 将 Mongo 索引 key（含带前导/尾随列的复合 `text` 索引 `_fts`/`_ftsx` + `weights`）归一化为可比对签名。
 */
const buildNormalizedMongoKeySignature = ({
  key,
  weights
}: {
  key: Record<string, unknown>;
  weights?: Record<string, unknown>;
}): string => {
  const skeleton: Array<[string, unknown]> = [];
  const textFields: string[] = [];
  let insertedTextPlaceholder = false;

  for (const [field, order] of Object.entries(key)) {
    if (field === '_ftsx') {
      continue;
    }
    if ((field === '_fts' && order === 'text') || order === 'text') {
      if (!insertedTextPlaceholder) {
        skeleton.push(['$text', 'text']);
        insertedTextPlaceholder = true;
      }
      if (field !== '_fts') {
        textFields.push(field);
      }
      continue;
    }
    skeleton.push([field, order]);
  }

  if (weights !== undefined && Object.keys(weights).length > 0) {
    if (!insertedTextPlaceholder) {
      skeleton.push(['$text', 'text']);
    }
    for (const field of Object.keys(weights)) {
      if (!textFields.includes(field)) {
        textFields.push(field);
      }
    }
  }

  return JSON.stringify({
    skeleton,
    text: textFields.sort()
  });
};

/**
 * 校验除 TTL (`expireAfterSeconds`) 外的所有索引关键选项是否完全等价。
 *
 * 无论声明侧是否省略选项，都会与现网值做双向比对（例如声明为全量索引但现网带有
 * `partialFilterExpression` / `unique` / `sparse` / `collation`，必须判为漂移而绝不静默放行）。
 */
const detectNonTtlOptionDrift = ({
  declared,
  live
}: {
  declared: MongoCollectionIndexDef;
  live: LiveMongoIndexSpec;
}): string | undefined => {
  const opts = declared.options as ExpectedMongoIndexOptions | undefined;
  const declaredKey = declared.key as Record<string, unknown>;
  const liveKey = live.key ?? {};

  const declaredUnique = Boolean(opts?.unique);
  const liveUnique = Boolean(live.unique);
  if (declaredUnique !== liveUnique) {
    return `unique mismatch (declared=${declaredUnique}, live=${liveUnique})`;
  }

  const declaredSparse = Boolean(opts?.sparse);
  const liveSparse = Boolean(live.sparse);
  if (declaredSparse !== liveSparse) {
    return `sparse mismatch (declared=${declaredSparse}, live=${liveSparse})`;
  }

  const declaredPartial = opts?.partialFilterExpression;
  const livePartial = live.partialFilterExpression;
  if (
    (declaredPartial === undefined) !== (livePartial === undefined) ||
    (declaredPartial !== undefined && !deepEqualNormalized(declaredPartial, livePartial))
  ) {
    return 'partialFilterExpression mismatch';
  }

  const declaredCollation = normalizeCollation(opts?.collation);
  const liveCollation = normalizeCollation(live.collation);
  if (
    (declaredCollation === undefined) !== (liveCollation === undefined) ||
    (declaredCollation !== undefined && !deepEqualNormalized(declaredCollation, liveCollation))
  ) {
    return 'collation mismatch';
  }

  const declaredWeights = normalizeTextWeights({
    key: declaredKey,
    weights: opts?.weights
  });
  const liveWeights = normalizeTextWeights({
    key: liveKey,
    weights: live.weights,
    textIndexVersion: live.textIndexVersion
  });
  if (
    (declaredWeights === undefined) !== (liveWeights === undefined) ||
    (declaredWeights !== undefined && !deepEqualNormalized(declaredWeights, liveWeights))
  ) {
    return 'weights mismatch';
  }

  const isText = declaredWeights !== undefined || liveWeights !== undefined;
  const declaredDefaultLanguage = isText
    ? (opts?.default_language ?? 'english')
    : opts?.default_language;
  const liveDefaultLanguage = isText ? (live.default_language ?? 'english') : live.default_language;
  if (declaredDefaultLanguage !== liveDefaultLanguage) {
    return `default_language mismatch (declared=${String(declaredDefaultLanguage)}, live=${String(liveDefaultLanguage)})`;
  }

  const declaredLanguageOverride = isText
    ? (opts?.language_override ?? 'language')
    : opts?.language_override;
  const liveLanguageOverride = isText
    ? (live.language_override ?? 'language')
    : live.language_override;
  if (declaredLanguageOverride !== liveLanguageOverride) {
    return `language_override mismatch (declared=${String(declaredLanguageOverride)}, live=${String(liveLanguageOverride)})`;
  }

  return undefined;
};

/**
 * 校验声明索引与现网索引的完整定义等价性（包含 TTL、partial、unique、sparse、collation 与 text 配置）。
 */
const detectCriticalOptionDrift = ({
  declared,
  live
}: {
  declared: MongoCollectionIndexDef;
  live: LiveMongoIndexSpec;
}): string | undefined => {
  const nonTtlDrift = detectNonTtlOptionDrift({ declared, live });
  if (nonTtlDrift !== undefined) {
    return nonTtlDrift;
  }

  const declaredTtl = declared.options?.expireAfterSeconds;
  const liveTtl = live.expireAfterSeconds;
  if (declaredTtl !== liveTtl) {
    return `expireAfterSeconds mismatch (declared=${String(declaredTtl)}, live=${String(liveTtl)})`;
  }

  return undefined;
};

/**
 * 判断现网候选索引是否仅存在可通过 `collMod` 原地更新的 TTL 数值漂移。
 */
const isTtlOnlyDrift = ({
  declared,
  live
}: {
  declared: MongoCollectionIndexDef;
  live: LiveMongoIndexSpec;
}): boolean => {
  const declaredTtl = declared.options?.expireAfterSeconds;
  if (
    declaredTtl === undefined ||
    live.expireAfterSeconds === undefined ||
    live.expireAfterSeconds === declaredTtl
  ) {
    return false;
  }
  return detectNonTtlOptionDrift({ declared, live }) === undefined;
};

/**
 * 判断同 key 异名的两份索引在 MongoDB 中能否合法共存：
 * - 单集合只允许一条 text 索引，无法共存；
 * - 仅当 `partialFilterExpression` 或 `collation` 不同时，MongoDB 允许同 key 多索引共存；
 * - 其余仅 `unique` / `sparse` / `expireAfterSeconds` 不同的同 key 索引互斥（Error 85）。
 */
const canCoexistOnSameKey = ({
  declared,
  live
}: {
  declared: MongoCollectionIndexDef;
  live: LiveMongoIndexSpec;
}): boolean => {
  const opts = declared.options as ExpectedMongoIndexOptions | undefined;
  const declaredIsText = isTextIndexSpec({
    key: declared.key as Record<string, unknown>,
    weights: opts?.weights
  });
  const liveIsText = isTextIndexSpec({
    key: live.key ?? {},
    weights: live.weights,
    textIndexVersion: live.textIndexVersion
  });
  if (declaredIsText || liveIsText) {
    return false;
  }

  const declaredPartial = opts?.partialFilterExpression;
  const livePartial = live.partialFilterExpression;
  const partialDiffers =
    (declaredPartial === undefined) !== (livePartial === undefined) ||
    (declaredPartial !== undefined && !deepEqualNormalized(declaredPartial, livePartial));
  if (partialDiffers) {
    return true;
  }

  const declaredCollation = normalizeCollation(opts?.collation);
  const liveCollation = normalizeCollation(live.collation);
  return (
    (declaredCollation === undefined) !== (liveCollation === undefined) ||
    (declaredCollation !== undefined && !deepEqualNormalized(declaredCollation, liveCollation))
  );
};

const indexLiveSpecs = (
  liveIndexes: readonly LiveMongoIndexSpec[]
): {
  liveBySignature: Map<string, LiveMongoIndexSpec[]>;
  liveByName: Map<string, LiveMongoIndexSpec>;
} => {
  const liveBySignature = new Map<string, LiveMongoIndexSpec[]>();
  const liveByName = new Map<string, LiveMongoIndexSpec>();

  for (const live of liveIndexes) {
    if (live.name !== undefined) {
      liveByName.set(live.name, live);
    }
    if (live.key === undefined) {
      continue;
    }
    const sig = buildNormalizedMongoKeySignature({
      key: live.key,
      weights: live.weights
    });
    const list = liveBySignature.get(sig);
    if (list !== undefined) {
      list.push(live);
    } else {
      liveBySignature.set(sig, [live]);
    }
  }

  return { liveBySignature, liveByName };
};

const pickPreferredCandidate = ({
  candidates,
  preferredName,
  predicate
}: {
  candidates: readonly LiveMongoIndexSpec[];
  preferredName: string;
  predicate: (live: LiveMongoIndexSpec) => boolean;
}): LiveMongoIndexSpec | undefined => {
  const matching = candidates.filter(predicate);
  if (matching.length === 0) {
    return undefined;
  }
  return matching.find((candidate) => candidate.name === preferredName) ?? matching[0];
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
 * - 按 `key + 完整 options` 遍历同 key 全部现网候选索引（兼容同 key 多 partial/collation 共存、
 *   复合 `text` 索引与未带 `fg_` 前缀的存量冻结索引），绝不让现网 partial/unique/sparse 索引掩盖缺失的全量索引；
 * - 遇到 Error 285（`IndexBuildAlreadyInProgress`）时按退避轮询等待而非崩溃；
 * - 可选 `allowCollModTtl: true` 时，对仅 `expireAfterSeconds` 漂移的 TTL 索引走 `collMod` 原地更新。
 */
export const syncMongoCollectionIndexes = async ({
  client,
  collections,
  datasource,
  allowCollModTtl = false,
  max285Retries = 10,
  retryDelayMs = 1_000,
  logger = silentLogger
}: {
  client: Mongoose;
  collections: readonly MongoCollectionDefinition<any>[];
  datasource?: DbDatasource;
  allowCollModTtl?: boolean;
  max285Retries?: number;
  retryDelayMs?: number;
  logger?: DbLogger;
}): Promise<MongoIndexSyncReport> => {
  const targetCollections =
    datasource === undefined
      ? collections
      : collections.filter((col) => col.datasource === datasource);

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
    const { liveBySignature, liveByName } = indexLiveSpecs(liveIndexes);
    const nativeCollection = db.collection(collection.name);

    for (const declared of desiredIndexes) {
      const indexName = deriveMongoIndexName(declared);
      const declaredOpts = declared.options as ExpectedMongoIndexOptions | undefined;
      const desiredSig = buildNormalizedMongoKeySignature({
        key: declared.key as Record<string, unknown>,
        weights: declaredOpts?.weights
      });
      const sameKeyCandidates = liveBySignature.get(desiredSig) ?? [];
      const sameNameLive = liveByName.get(indexName);

      // 1. 仅当同 key 候选中存在定义完全等价的现网索引时，才视为已满足并跳过创建。
      const exactMatch = pickPreferredCandidate({
        candidates: sameKeyCandidates,
        preferredName: indexName,
        predicate: (live) => detectCriticalOptionDrift({ declared, live }) === undefined
      });
      if (exactMatch !== undefined) {
        report.skippedExisting.push({
          collection: collection.name,
          indexName,
          matchedLiveName: exactMatch.name ?? indexName
        });
        continue;
      }

      // 2. 允许原地更新 TTL 时，优先匹配仅 expireAfterSeconds 不同的候选索引。
      if (allowCollModTtl) {
        const ttlCandidate = pickPreferredCandidate({
          candidates: sameKeyCandidates,
          preferredName: indexName,
          predicate: (live) => isTtlOnlyDrift({ declared, live })
        });
        if (ttlCandidate !== undefined) {
          const liveName = ttlCandidate.name ?? indexName;
          const desiredTtl = declared.options!.expireAfterSeconds!;
          await db.command({
            collMod: collection.name,
            index: { name: liveName, expireAfterSeconds: desiredTtl }
          });
          ttlCandidate.expireAfterSeconds = desiredTtl;
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
      }

      // 3. 声明索引名已被不同 key 或不同 options 的现网索引占用时，直接记录漂移告警而不伪装跳过。
      if (sameNameLive !== undefined) {
        const liveSig = buildNormalizedMongoKeySignature({
          key: sameNameLive.key ?? {},
          weights: sameNameLive.weights
        });
        const reason =
          liveSig !== desiredSig
            ? `key mismatch on existing index name "${indexName}"`
            : (detectCriticalOptionDrift({ declared, live: sameNameLive }) ?? 'option mismatch');
        report.optionDriftWarnings.push({
          collection: collection.name,
          indexName,
          reason
        });
        logger.warn('Mongo index name already exists with drifted definition (not auto-dropped)', {
          collection: collection.name,
          indexName,
          liveName: sameNameLive.name ?? indexName,
          reason
        });
        continue;
      }

      // 4. 无等价索引且索引名未占用：尝试补建（同 key 异名且可共存的 partial/collation 将共存；
      //    若同 key 互斥导致 Mongo 返回 85/86，则记录选项漂移告警而不误记为 skippedExisting）。
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
        const createdSpec: LiveMongoIndexSpec = {
          name: indexName,
          key: declared.key as Record<string, unknown>,
          ...(declared.options as LiveMongoIndexSpec | undefined)
        };
        const existingList = liveBySignature.get(desiredSig);
        if (existingList !== undefined) {
          existingList.push(createdSpec);
        } else {
          liveBySignature.set(desiredSig, [createdSpec]);
        }
        liveByName.set(indexName, createdSpec);
      }
    }
  }

  return report;
};

/**
 * 显式一次性清理单个 Mongo 废弃索引（严禁在普通启动同步循环内调用）。
 *
 * 安全守卫（双保险保护客户 DBA 自建索引）：
 * - 对 `fg_*` 托管索引：允许按名称安全删除（若同时提供 `expectedKey` 也会校验）；
 * - 对无 `fg_` 前缀的存量历史索引：必须显式提供 `expectedKey`；
 * - 无论是否传入 `expectedOptions`，始终强制执行完整历史 option 签名比对
 *   （省略即视为 `unique=false`、`sparse=false`、无 `partialFilterExpression` / `expireAfterSeconds` / `collation`），
 *   只要现网存在任何预期外选项即返回 `skipped_mismatch` 绝不误删。
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
  expectedOptions?: ExpectedMongoIndexOptions;
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
    const expectedSig = buildNormalizedMongoKeySignature({
      key: expectedKey,
      weights: expectedOptions?.weights
    });
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

  const effectiveDeclaredKey = (() => {
    if (expectedKey !== undefined) {
      return expectedKey;
    }
    // 对 fg_* 托管索引省略 expectedKey 时，若现网为 text 索引需按 weights 字段重建基础声明键（默认权重 1），
    // 确保自定义权重/语言等 option 漂移仍会被完整 option 校验捕获。
    if (
      isTextIndexSpec({
        key: live.key ?? {},
        weights: live.weights,
        textIndexVersion: live.textIndexVersion
      })
    ) {
      const reconstructed: Record<string, unknown> = {};
      for (const [field, order] of Object.entries(live.key ?? {})) {
        if (field !== '_fts' && field !== '_ftsx') {
          reconstructed[field] = order;
        }
      }
      for (const field of Object.keys(live.weights ?? {})) {
        reconstructed[field] = 'text';
      }
      return reconstructed;
    }
    return live.key ?? {};
  })();

  const drift = detectCriticalOptionDrift({
    declared: {
      key: effectiveDeclaredKey as any,
      options: (expectedOptions ?? {}) as any
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

/** 100% 只读的 MongoDB 索引巡检器（绝不建索引也不删索引）。 */
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
    const { liveBySignature, liveByName } = indexLiveSpecs(liveIndexes);
    const matchedLiveNames = new Set<string>(['_id_']);

    for (const declared of desiredIndexes) {
      const indexName = deriveMongoIndexName(declared);
      const declaredOpts = declared.options as ExpectedMongoIndexOptions | undefined;
      const desiredSig = buildNormalizedMongoKeySignature({
        key: declared.key as Record<string, unknown>,
        weights: declaredOpts?.weights
      });
      const sameKeyCandidates = liveBySignature.get(desiredSig) ?? [];
      const sameNameLive = liveByName.get(indexName);

      // 1. 存在完整等价的现网索引（不限于同名，兼容存量冻结索引）。
      const exactMatch = pickPreferredCandidate({
        candidates: sameKeyCandidates,
        preferredName: indexName,
        predicate: (live) => detectCriticalOptionDrift({ declared, live }) === undefined
      });
      if (exactMatch !== undefined) {
        matchedLiveNames.add(exactMatch.name ?? indexName);
        continue;
      }

      // 2. 声明索引名已被不同 key 或不同 options 占用 -> 报 optionMismatches。
      if (sameNameLive !== undefined) {
        const liveName = sameNameLive.name ?? indexName;
        matchedLiveNames.add(liveName);
        const liveSig = buildNormalizedMongoKeySignature({
          key: sameNameLive.key ?? {},
          weights: sameNameLive.weights
        });
        const reason =
          liveSig !== desiredSig
            ? `key mismatch on existing index name "${indexName}"`
            : (detectCriticalOptionDrift({ declared, live: sameNameLive }) ?? 'option mismatch');
        report.optionMismatches.push({
          collection: collection.name,
          indexName,
          liveName,
          reason
        });
        continue;
      }

      // 3. 存在同 key 但无法共存的现网冲突索引（如 unique/sparse/TTL/text 差异）-> 报 optionMismatches。
      const conflictingCandidate = sameKeyCandidates.find(
        (live) => !canCoexistOnSameKey({ declared, live })
      );
      if (conflictingCandidate !== undefined) {
        const liveName = conflictingCandidate.name ?? indexName;
        matchedLiveNames.add(liveName);
        const reason =
          detectCriticalOptionDrift({ declared, live: conflictingCandidate }) ?? 'option mismatch';
        report.optionMismatches.push({
          collection: collection.name,
          indexName,
          liveName,
          reason
        });
        continue;
      }

      // 4. 其余情形（无同 key 候选，或仅存在可共存的 partial/collation 同 key 索引）-> 缺失目标索引。
      report.missingIndexes.push({ collection: collection.name, indexName });
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

/**
 * 100% 只读校验：判断目标集合当前已提交就绪的 `listIndexes()` 中是否存在与 `key + options`
 * 完整等价的索引（MongoDB 后台构建中的索引不会出现在 `listIndexes()` 中）。
 */
export const hasMatchingMongoIndex = async ({
  client,
  collectionName,
  key,
  options
}: {
  client: Mongoose;
  collectionName: string;
  key: Record<string, unknown>;
  options?: ExpectedMongoIndexOptions;
}): Promise<boolean> => {
  if (client.connection.db === undefined) {
    throw new DbConfigurationError('MongoDB connection is not established');
  }

  const liveIndexes = await listCollectionIndexesSafe(client, collectionName);
  const expectedSig = buildNormalizedMongoKeySignature({
    key,
    weights: options?.weights
  });

  return liveIndexes.some((live) => {
    const liveSig = buildNormalizedMongoKeySignature({
      key: live.key ?? {},
      weights: live.weights
    });
    if (liveSig !== expectedSig) {
      return false;
    }
    return (
      detectCriticalOptionDrift({
        declared: {
          key: key as any,
          options: (options ?? {}) as any
        },
        live
      }) === undefined
    );
  });
};
