import { useCallback, useEffect, useMemo, useState } from 'react';

export type PersistedFilterSchema<T> = {
  safeParse: (data: unknown) => { success: true; data: T } | { success: false };
};

export type UsePersistedFiltersProps<T> = {
  key: string;
  schema: PersistedFilterSchema<T>;
  defaultValue: T;
};

/** 与 ahooks `useLocalStorageState` 同页同步事件名，两边改同一 key 时能互相更新。 */
const STORAGE_SYNC_EVENT = 'AHOOKS_SYNC_STORAGE_EVENT_NAME';

/** key 未就绪时不读写，避免登录前落到错误桶。 */
export const isFilterStorageKeyReady = (key: string) => key.trim().length > 0;

/**
 * 从 localStorage 读筛选值。key 未就绪或解析失败返回 undefined，由上层回默认值。
 */
const readFilterStorage = (key: string): unknown => {
  if (!isFilterStorageKeyReady(key) || typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/**
 * 用 schema 解析持久化筛选值。非法数据回默认值，不把脏数据写回去。
 */
export const resolvePersistedFilterValue = <T>(
  raw: unknown,
  schema: PersistedFilterSchema<T>,
  defaultValue: T
): T => {
  if (raw === undefined || raw === null) return defaultValue;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : defaultValue;
};

const writeFilterStorage = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  try {
    const oldValue = window.localStorage.getItem(key);
    const newValue = JSON.stringify(value);
    window.localStorage.setItem(key, newValue);
    window.dispatchEvent(
      new CustomEvent(STORAGE_SYNC_EVENT, {
        detail: {
          key,
          newValue,
          oldValue,
          storageArea: window.localStorage
        }
      })
    );
  } catch {
    // Safari 隐私模式等写失败时，内存态仍由调用方 setState 保留。
  }
};

/**
 * 按 key 持久化筛选状态。`packages/web` 不感知业务页面，调用方自行拼 key。
 *
 * 不用 ahooks `useLocalStorageState`：它在 key 为空时仍会读写 localStorage。
 * 未就绪时只留在内存默认值；key 就绪后再读、写、跨 tab / 同页同步。
 */
export const usePersistedFilters = <T>({
  key,
  schema,
  defaultValue
}: UsePersistedFiltersProps<T>): [T, (next: T | ((prev: T) => T)) => void] => {
  const ready = isFilterStorageKeyReady(key);
  const [stored, setStored] = useState(() => ({
    key,
    raw: ready ? readFilterStorage(key) : undefined
  }));

  // key 变化时在渲染期重置，避免 effect 里同步 setState。
  if (stored.key !== key) {
    setStored({
      key,
      raw: ready ? readFilterStorage(key) : undefined
    });
  }

  const raw = stored.key === key ? stored.raw : ready ? readFilterStorage(key) : undefined;

  useEffect(() => {
    if (!isFilterStorageKeyReady(key)) return;

    const syncFromStorage = (storageKey: string | null) => {
      if (storageKey !== key) return;
      setStored({ key, raw: readFilterStorage(key) });
    };
    const onStorage = (event: StorageEvent) => syncFromStorage(event.key);
    const onSync = (event: Event) => {
      syncFromStorage((event as CustomEvent<{ key?: string }>).detail?.key ?? null);
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(STORAGE_SYNC_EVENT, onSync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(STORAGE_SYNC_EVENT, onSync);
    };
  }, [key]);

  const value = useMemo(
    () => (ready ? resolvePersistedFilterValue(raw, schema, defaultValue) : defaultValue),
    [defaultValue, raw, ready, schema]
  );

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      if (!ready) return;
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
      const parsed = schema.safeParse(resolved);
      if (!parsed.success) return;
      setStored({ key, raw: parsed.data });
      writeFilterStorage(key, parsed.data);
    },
    [key, ready, schema, value]
  );

  return [value, setValue];
};
