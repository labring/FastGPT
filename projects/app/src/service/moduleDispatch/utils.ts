import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { DYNAMIC_INPUT_KEY, ModuleIOValueTypeEnum } from '@fastgpt/global/core/module/constants';

export const getHistories = (history?: ChatItemType[] | number, histories: ChatItemType[] = []) => {
  if (!history) return [];
  if (typeof history === 'number') return histories.slice(-history);
  if (Array.isArray(history)) return history;

  return [];
};

/* value type format */
export const valueTypeFormat = (value: any, type?: `${ModuleIOValueTypeEnum}`) => {
  if (value === undefined) return;

  if (type === 'string') {
    if (typeof value !== 'object') return String(value);
    return JSON.stringify(value);
  }
  if (type === 'number') return Number(value);
  if (type === 'boolean') return Boolean(value);

  return value;
};
