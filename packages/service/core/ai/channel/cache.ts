/**
 * TTL bucket cache for aiproxy channel lists (performance: model-list
 * channelCount and channel list views used to hit aiproxy on every request —
 * up to N sequential paginated fetches per page of models).
 *
 * Channel data changes only through low-frequency admin ops, so a short TTL
 * (30s) plus active invalidation on write handlers keeps reads at ~0 round
 * trips. Delete-protection math (getChannelAffectedModels) intentionally stays
 * real-time and does NOT read this cache (F2-S4/F3-S4 confirm-before-delete).
 *
 * Storage follows the existing global cache pattern (model/utils.ts
 * loadSystemModels): a single global object, JS single-threaded assignment is
 * atomic, no locking needed. Multi-instance deployments converge via TTL.
 */

const CACHE_TTL_MS = 30_000;

/** Bucket keys (shared with api.ts's cache-aware list helpers) */
export const CACHE_KEY_SYSTEM = '__system__';
export const CACHE_KEY_GLOBAL_GROUPS = '__globalGroups__';

type Bucket = {
  channels: unknown[];
  fetchedAt: number;
};

type ChannelBucketCache = {
  system?: Bucket;
  groups: Map<string, Bucket>;
  globalGroups?: Bucket;
};

const getCache = (): ChannelBucketCache => {
  globalThis.aiproxyChannelBucketCache ||= { groups: new Map() };
  return globalThis.aiproxyChannelBucketCache;
};

const setBucket = (key: string, bucket: Bucket) => {
  const cache = getCache();
  if (key === CACHE_KEY_SYSTEM) {
    cache.system = bucket;
  } else if (key === CACHE_KEY_GLOBAL_GROUPS) {
    cache.globalGroups = bucket;
  } else {
    cache.groups.set(key, bucket);
  }
};

const getBucket = (key: string): Bucket | undefined => {
  const cache = getCache();
  if (key === CACHE_KEY_SYSTEM) return cache.system;
  if (key === CACHE_KEY_GLOBAL_GROUPS) return cache.globalGroups;
  return cache.groups.get(key);
};

/**
 * In-flight dedup: concurrent cold misses share a single fetchAll promise per
 * bucket, so N concurrent reads trigger one paginated loop instead of N.
 * The promise is removed on settle (success writes the bucket, failure drops it).
 */
const inflight = new Map<string, Promise<unknown[]>>();

/** Fetch or reuse the cached full list of a bucket (system / one group / all groups) */
export const getCachedChannels = async <T extends { id: number }>(
  fetchAll: () => Promise<T[]>,
  key: string
): Promise<T[]> => {
  const cached = getBucket(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.channels as T[];

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T[]>;

  const promise = (async () => {
    try {
      const channels = await fetchAll();
      setBucket(key, { channels, fetchedAt: Date.now() });
      return channels;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise as Promise<T[]>;
};

/**
 * Invalidate the system-channel bucket after a system-channel write
 * (create/update/delete/status). System channels never appear in the group
 * buckets or the global aggregate, so nothing else needs to be dropped.
 */
export const invalidateSystemChannelCache = () => {
  getCache().system = undefined;
};

/**
 * Invalidate a group's bucket plus the global group-channel aggregate after a
 * group-channel write — the aggregate contains the same channels.
 */
export const invalidateGroupChannelCache = (groupId: string) => {
  const cache = getCache();
  cache.groups.delete(groupId);
  cache.globalGroups = undefined;
};

/* ═══ Provider type metas cache (channel form hints) ═══
 * Near-static data — only changes when aiproxy adds provider types — so a long
 * TTL collapses every "open channel modal" round trip into one per window,
 * instead of one admin call per user per modal open. Same global-object +
 * inflight-dedup pattern as the buckets above (JS single-threaded assignment
 * is atomic; multi-instance deployments converge via TTL). */
const METAS_TTL_MS = 10 * 60_000;

let metasCache: { data: unknown; fetchedAt: number } | undefined;
let metasInflight: Promise<unknown> | undefined;

export const getCachedTypeMetas = async <T>(fetch: () => Promise<T>): Promise<T> => {
  if (metasCache && Date.now() - metasCache.fetchedAt < METAS_TTL_MS) {
    return metasCache.data as T;
  }
  if (metasInflight) return metasInflight as Promise<T>;

  const promise = (async () => {
    try {
      const data = await fetch();
      metasCache = { data, fetchedAt: Date.now() };
      return data;
    } finally {
      metasInflight = undefined;
    }
  })();
  metasInflight = promise;
  return promise as Promise<T>;
};

/** Test helper: drop all cached buckets (fresh TTL state) */
export const resetChannelCache = () => {
  globalThis.aiproxyChannelBucketCache = { groups: new Map() };
  inflight.clear();
  metasCache = undefined;
  metasInflight = undefined;
};

declare global {
  var aiproxyChannelBucketCache: ChannelBucketCache | undefined;
}
