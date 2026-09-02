import { useCallback, useMemo } from 'react';
import { useLocalStorageState } from 'ahooks';

export type PersistedFilterSchema<T> = {
  safeParse: (data: unknown) => { success: true; data: T } | { success: false };
};

export type UsePersistedFiltersProps<T> = {
  key: string;
  schema: PersistedFilterSchema<T>;
  defaultValue: T;
};

const UNREADY_STORAGE_KEY = 'fastgpt:filters:__unready__';

/** key 未就绪时不读写，避免登录前落到错误桶。 */
export const isFilterStorageKeyReady = (key: string) => key.trim().length > 0;

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

/**
 * 按 key 持久化筛选状态。`packages/web` 不感知业务页面，调用方自行拼 key。
 */
export const usePersistedFilters = <T>({
  key,
  schema,
  defaultValue
}: UsePersistedFiltersProps<T>): [T, (next: T | ((prev: T) => T)) => void] => {
  const ready = isFilterStorageKeyReady(key);
  const [raw, setRaw] = useLocalStorageState<unknown>(ready ? key : UNREADY_STORAGE_KEY, {
    defaultValue: undefined,
    listenStorageChange: true
  });

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
      setRaw(parsed.data);
    },
    [ready, schema, setRaw, value]
  );

  return [value, setValue];
};
