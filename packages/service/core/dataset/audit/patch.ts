/**
 * 将 API 配置的局部请求展开成 Mongo dotted updates，并用同一批更新生成完整的有效新值。
 * 空对象和 null 与持久化路径一样不产生写入，数组作为叶子整体替换。
 */
export const buildDatasetConfigUpdatePatch = ({
  currentValue,
  patchValue,
  rootPath
}: {
  currentValue: unknown;
  patchValue: unknown;
  rootPath: string;
}): { updateFields: Record<string, unknown>; effectiveValue: unknown } => {
  const updateFields: Record<string, unknown> = {};

  const toRecord = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    const objectValue = value as { toObject?: () => unknown };
    const plainValue = typeof objectValue.toObject === 'function' ? objectValue.toObject() : value;
    return plainValue && typeof plainValue === 'object' && !Array.isArray(plainValue)
      ? Object.fromEntries(Object.entries(plainValue))
      : {};
  };

  const applyPatch = (
    current: unknown,
    patch: unknown,
    path: string
  ): { value: unknown; updated: boolean } => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return { value: current, updated: false };
    }

    const currentRecord = toRecord(current);
    const nextRecord = { ...currentRecord };
    let updated = false;

    for (const [key, value] of Object.entries(patch)) {
      // Mongo update flattener treats null as an object with no enumerable fields, so it is a no-op.
      if (value === null) continue;

      const fieldPath = `${path}.${key}`;
      if (typeof value === 'object' && !Array.isArray(value)) {
        const nestedPatch = applyPatch(currentRecord[key], value, fieldPath);
        if (nestedPatch.updated) {
          nextRecord[key] = nestedPatch.value;
          updated = true;
        }
        continue;
      }

      updateFields[fieldPath] = value;
      nextRecord[key] = value;
      updated = true;
    }

    return { value: updated ? nextRecord : current, updated };
  };

  const { value: effectiveValue } = applyPatch(currentValue, patchValue, rootPath);
  return { updateFields, effectiveValue };
};
