export type MultiSelectFilterMode = 'all' | 'selected';

export type MultiSelectFilterValue<T extends string = string> = {
  mode: MultiSelectFilterMode;
  values: T[];
};

export type MultiSelectFilterOption<T extends string = string> = {
  value: T;
  label: string;
  avatar?: string;
  extra?: string;
  searchText?: string;
};

export type MultiSelectFilterSummary = {
  text: string;
  extraCount: number;
  /** 已选具体项用灰色胶囊；全部 / 未选择 / 只选自己文案用纯文本。 */
  chip: boolean;
};

export const createMultiSelectFilter = <T extends string>(
  value?: Partial<MultiSelectFilterValue<T>>
): MultiSelectFilterValue<T> => ({
  mode: value?.mode ?? 'all',
  values: value?.values ?? []
});

/**
 * 点某一项：从「全部」进入已选，或在已选里增删。清空最后一项后仍是 selected，列表按空数组筛空。
 */
export const toggleMultiSelectFilterValue = <T extends string>(
  current: MultiSelectFilterValue<T>,
  value: T
): MultiSelectFilterValue<T> => {
  const selected = current.mode === 'selected' ? current.values : [];
  const nextValues = selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
  return { mode: 'selected', values: nextValues };
};

/** 全部不传该字段；已选含空数组，调用方按空结果处理。 */
export const toMultiSelectFilterQuery = <T extends string>(
  value?: MultiSelectFilterValue<T>
): T[] | undefined => {
  if (value?.mode !== 'selected') return undefined;
  return value.values;
};

const sanitizeMultiSelectFilterValues = <T extends string>(values: T[], validValues: T[]): T[] => {
  const validSet = new Set(validValues);
  return values.filter((item) => validSet.has(item));
};

/**
 * 已选值里丢掉已经不在候选项的 id。没有变化返回 null，避免无意义 setState。
 * 调用方要等候选项加载完再调，避免分页未载完时误清。
 * 候选项会随日期/来源变化的筛选不要用这个，否则会把用户已选的值清掉甚至回退成「全部」。
 */
export const syncSelectedFilterValues = <T extends string>(
  value: MultiSelectFilterValue<T>,
  validValues: T[]
): MultiSelectFilterValue<T> | null => {
  if (value.mode !== 'selected' || value.values.length === 0) return null;
  const nextIds = sanitizeMultiSelectFilterValues(value.values, validValues);
  if (nextIds.length === value.values.length) return null;
  return nextIds.length === 0 ? createMultiSelectFilter<T>() : { ...value, values: nextIds };
};

/**
 * 把已选但不在当前列表里的项补回去，只影响展示，不改筛选值。
 * 日志用户列表随日期变化时，触发器和下拉仍能显示之前选中的人。
 */
export const mergeRememberedFilterOptions = <T extends string>(
  options: Array<MultiSelectFilterOption<T>>,
  selectedValues: T[],
  remembered: Array<MultiSelectFilterOption<T>>
): Array<MultiSelectFilterOption<T>> => {
  if (selectedValues.length === 0) return options;
  const seen = new Set(options.map((item) => item.value));
  const rememberedMap = new Map(remembered.map((item) => [item.value, item]));
  const extras = selectedValues.flatMap((id) => {
    if (seen.has(id)) return [];
    const item = rememberedMap.get(id);
    return item ? [item] : [];
  });
  return extras.length ? [...extras, ...options] : options;
};

/**
 * 触发器文案：全部、未选择、可选的「只选自己」纯文本，其余为第一项名字 +N。
 */
export const getMultiSelectFilterSummary = <T extends string>({
  mode,
  values,
  options,
  currentValue,
  labels
}: {
  mode: MultiSelectFilterMode;
  values: T[];
  options: Array<Pick<MultiSelectFilterOption<T>, 'value' | 'label'>>;
  currentValue?: T;
  labels: {
    all: string;
    unselected: string;
    selectedSelf?: string;
  };
}): MultiSelectFilterSummary => {
  if (mode !== 'selected') {
    return { text: labels.all, extraCount: 0, chip: false };
  }
  if (values.length === 0) {
    return { text: labels.unselected, extraCount: 0, chip: false };
  }
  if (values.length === 1 && currentValue && values[0] === currentValue && labels.selectedSelf) {
    return { text: labels.selectedSelf, extraCount: 0, chip: false };
  }

  const first = options.find((item) => item.value === values[0]);
  return {
    text: first?.label ?? '',
    extraCount: Math.max(values.length - 1, 0),
    chip: true
  };
};
