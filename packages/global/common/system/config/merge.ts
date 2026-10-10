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

/**
 * 判断 dotted 路径是否存在于 overrides 中（数组与 null 按叶子处理）。
 *
 * 用于识别"使用方已就某个字段表达过意图"：路径存在即说明该字段有明确取值或明确默认值。
 */
export const hasOverridePath = (overrides: unknown, path: string): boolean => {
  const segments = path.split('.').filter(Boolean);
  let cursor: unknown = overrides;

  for (const segment of segments) {
    if (!isPlainObject(cursor) || !(segment in cursor)) {
      return false;
    }
    cursor = cursor[segment];
  }

  return segments.length > 0;
};

/**
 * 计算被 {@link pruneDefaultOverrides} 剪掉的叶子路径（数组与 null 按叶子处理）。
 *
 * 被剪掉的路径代表"提交了、但与内置默认值取值相同"的字段，即使用方明确要求该字段取默认值。
 * 必须与"从未配置"区分开：迁移回填若把它们当成缺失字段，会把使用方刚清空的值重新填回。
 */
export const collectPrunedLeafPaths = (
  submitted: unknown,
  pruned: unknown,
  prefix: string[] = []
): string[] => {
  if (!isPlainObject(submitted)) return [];

  const prunedObject = isPlainObject(pruned) ? pruned : {};
  const paths: string[] = [];

  for (const [key, value] of Object.entries(submitted)) {
    if (value === undefined) continue;

    const path = [...prefix, key];
    if (isPlainObject(value)) {
      paths.push(...collectPrunedLeafPaths(value, prunedObject[key], path));
      continue;
    }

    // 叶子（含数组/null）：剪枝结果里没有同键即说明该叶子被剪掉
    if (!(key in prunedObject)) {
      paths.push(path.join('.'));
    }
  }

  return paths;
};
