import type { TUpdateListItem } from './type';
import { VariableUpdateOperatorEnum } from './constants';

export const normalizeUpdateItem = (item: TUpdateListItem): TUpdateListItem => {
  // 新格式：已有 updateType，直接返回
  if (item.updateType !== undefined) return item;

  // 旧格式：value 是数组
  const raw = item.value;
  if (Array.isArray(raw)) {
    const [first, second] = raw as [string, string | undefined];
    const isRef = !!first;
    return {
      variable: item.variable,
      valueType: item.valueType,
      renderType: item.renderType,
      updateType: VariableUpdateOperatorEnum.set,
      referenceValue: isRef ? [first, second] : undefined,
      inputValue: isRef ? undefined : second
    };
  }

  return {
    ...item,
    updateType: VariableUpdateOperatorEnum.set,
    inputValue: ''
  };
};
