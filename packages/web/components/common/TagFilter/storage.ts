export const FILTER_STORAGE_KEY = 'fastgpt:filter-selections';

/** 所有单选控件共用一个对象；损坏、禁用或不可用的存储不影响筛选操作。 */
const readSelections = (): Record<string, unknown> => {
  try {
    const data: unknown = JSON.parse(window.localStorage.getItem(FILTER_STORAGE_KEY) ?? '{}');
    return data !== null && typeof data === 'object' && !Array.isArray(data)
      ? Object.fromEntries(Object.entries(data))
      : {};
  } catch {
    return {};
  }
};

/** 只读取控件自己的值，调用方还需按当前选项校验。 */
export const readFilterSelection = (storageKey: string): unknown => {
  const data = readSelections();
  return Object.hasOwn(data, storageKey) ? data[storageKey] : undefined;
};

/** 合并最新存储避免覆盖其他控件；undefined 会清除该控件的选择。 */
export const writeFilterSelection = (storageKey: string, value: unknown) => {
  try {
    const data = { ...readSelections(), [storageKey]: value };
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 隐私模式或配额不足时，保留受控组件的正常交互。
  }
};
