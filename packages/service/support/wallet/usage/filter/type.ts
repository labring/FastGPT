import type { UsageFilterContext } from '@fastgpt/global/support/wallet/usage/filter';

export type UsageDepartment = {
  _id: string;
  path: string;
  pathId: string;
  name: string;
  avatar?: string;
};

export type ResolvedUsageScope =
  | { kind: 'self'; tmbId: string }
  | { kind: 'all' }
  | { kind: 'members'; ids: [string, ...string[]] }
  | { kind: 'none' };

export type UsageScopeResult = {
  scope: ResolvedUsageScope;
  context: UsageFilterContext;
  departments: UsageDepartment[];
  directoryId?: string;
};
