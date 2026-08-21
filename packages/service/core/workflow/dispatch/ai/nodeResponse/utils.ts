import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';

export const getUsageTotalPoints = (usages: ChatNodeUsageType[] = []) =>
  usages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

export const getObjectToolInput = (params: unknown) =>
  params && typeof params === 'object' && !Array.isArray(params)
    ? (params as Record<string, any>)
    : undefined;

export const stringifyToolResponse = (response: unknown) =>
  typeof response === 'string' ? response : JSON.stringify(response ?? '');
