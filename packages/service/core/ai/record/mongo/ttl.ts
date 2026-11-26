import { MongoLLMRequestRecord } from '../schema';

export const LEGACY_LLM_RECORD_TTL_INDEX_NAME = 'createdAt_1';

type RawIndexInfo = {
  name?: string;
  key?: Record<string, unknown>;
  expireAfterSeconds?: unknown;
  hidden?: unknown;
};

const isMongoErrorCode = (error: unknown, codes: readonly number[]) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof (error as { code?: unknown }).code === 'number' &&
  codes.includes((error as { code: number }).code);

const isSingleCreatedAtKey = (key: unknown): boolean => {
  if (!key || typeof key !== 'object' || Array.isArray(key)) return false;
  const entries = Object.entries(key as Record<string, unknown>);
  return entries.length === 1 && entries[0][0] === 'createdAt' && entries[0][1] === 1;
};

const isValidTtlSeconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * 查询 `llm_request_records` 集合上当前仍生效的 `createdAt` TTL 索引最短过期秒数。
 *
 * 说明：MongoDB 即使对 `hidden: true` 的 TTL 索引仍会执行过期删除，因此不按 `hidden` 过滤；
 * 若集合尚不存在（NamespaceNotFound / 26）或不存在 `{ createdAt: 1 }` TTL 索引则返回 `null`。
 */
export const getLegacyCreatedAtTtlSeconds = async (): Promise<number | null> => {
  let indexes: RawIndexInfo[];
  try {
    indexes = (await MongoLLMRequestRecord.collection.indexes()) as RawIndexInfo[];
  } catch (error) {
    if (isMongoErrorCode(error, [26])) {
      return null;
    }
    throw error;
  }

  let minTtlSeconds: number | null = null;
  for (const index of indexes) {
    if (!isSingleCreatedAtKey(index.key) || !isValidTtlSeconds(index.expireAfterSeconds)) {
      continue;
    }
    if (minTtlSeconds === null || index.expireAfterSeconds < minTtlSeconds) {
      minTtlSeconds = index.expireAfterSeconds;
    }
  }

  return minTtlSeconds;
};
