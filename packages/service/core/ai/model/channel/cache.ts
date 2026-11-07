/* ═══ Provider type metas cache (channel form hints) ═══
 * Near-static data — only changes when aiproxy adds provider types — so a long
 * TTL collapses every "open channel modal" round trip into one per window,
 * instead of one admin call per user per modal open.
 */
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

/** Test helper: drop cached metas state */
export const resetChannelCache = () => {
  metasCache = undefined;
  metasInflight = undefined;
};
