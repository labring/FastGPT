const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof RegExp)
  );
};

/**
 * 递归深度合并配置默认值与 overrides。
 * - 基础类型、数组、null 均直接由 overrides 覆盖；
 * - 纯对象类型递归合并；
 * - overrides 中为 undefined 的键不参与覆盖。
 */
export const deepMergeConfig = <T>(defaults: T, overrides?: unknown): T => {
  if (overrides === undefined) {
    return structuredClone(defaults);
  }

  if (!isPlainObject(defaults) || !isPlainObject(overrides)) {
    return (overrides !== undefined ? overrides : structuredClone(defaults)) as T;
  }

  const result: Record<string, unknown> = structuredClone(defaults);

  for (const [key, overrideValue] of Object.entries(overrides)) {
    if (overrideValue === undefined) continue;

    const defaultValue = result[key];
    if (isPlainObject(defaultValue) && isPlainObject(overrideValue)) {
      result[key] = deepMergeConfig(defaultValue, overrideValue);
    } else {
      result[key] = structuredClone(overrideValue);
    }
  }

  return result as T;
};

/**
 * 剪枝 overrides 中与 defaults 一致的冗余字段，保持数据库存储精简。
 */
export const pruneDefaultOverrides = (
  overrides: unknown,
  defaults: unknown
): Record<string, unknown> | undefined => {
  if (!isPlainObject(overrides)) {
    return undefined;
  }
  if (!isPlainObject(defaults)) {
    return structuredClone(overrides);
  }

  const pruned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;

    const defaultValue = defaults[key];

    if (isPlainObject(value) && isPlainObject(defaultValue)) {
      const nested = pruneDefaultOverrides(value, defaultValue);
      if (nested && Object.keys(nested).length > 0) {
        pruned[key] = nested;
      }
    } else if (JSON.stringify(value) !== JSON.stringify(defaultValue)) {
      pruned[key] = structuredClone(value);
    }
  }

  return Object.keys(pruned).length > 0 ? pruned : undefined;
};
