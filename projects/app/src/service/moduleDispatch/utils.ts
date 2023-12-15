import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { DYNAMIC_INPUT_KEY } from '@fastgpt/global/core/module/constants';

export const getHistories = (history?: ChatItemType[] | number, histories: ChatItemType[] = []) => {
  if (!history) return [];
  if (typeof history === 'number') return histories.slice(-history);
  if (Array.isArray(history)) return history;

  return [];
};

export const flatDynamicParams = (params: Record<string, any>) => {
  const dynamicParams = params[DYNAMIC_INPUT_KEY];
  if (!dynamicParams) return params;
  return {
    ...params,
    ...dynamicParams,
    [DYNAMIC_INPUT_KEY]: undefined
  };
};
