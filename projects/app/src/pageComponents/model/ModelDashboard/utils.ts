/**
 * 按端到端耗时计算平均输出速度（output_tokens / total_time_s），保留两位小数。
 * 输出 token 或总耗时非正时返回 0。
 */
export const calcAvgTps = (outputTokens: number, totalTimeMs: number): number => {
  if (outputTokens <= 0 || totalTimeMs <= 0) {
    return 0;
  }

  return Math.round((outputTokens / (totalTimeMs / 1000)) * 100) / 100;
};

export type SortDirection = 'asc' | 'desc' | null;

export type SortState<TField extends string> = {
  field: TField | null;
  direction: SortDirection;
};

/**
 * 表格列三态排序流转：未排序 -> 降序 -> 升序 -> 未排序。
 * 切换到新列时默认从降序开始。
 */
export const getNextSortState = <TField extends string>(
  current: SortState<TField>,
  targetField: TField
): SortState<TField> => {
  if (current.field !== targetField || current.direction === null) {
    return { field: targetField, direction: 'desc' };
  }
  if (current.direction === 'desc') {
    return { field: targetField, direction: 'asc' };
  }
  return { field: null, direction: null };
};
