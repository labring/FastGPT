import type { SourceMemberType } from '../../../support/user/type';
import type { CreateUsageProps } from './api';
import { UsageSourceEnum } from './constants';

export type UsageListItemCountType = {
  inputTokens?: number;
  outputTokens?: number;
  charsLength?: number;
  duration?: number;
  pages?: number;
  count?: number; // Times

  // deprecated
  tokens?: number;
};

export type UsageListItemType = UsageListItemCountType & {
  moduleName: string;
  amount: number;
  model?: string;
  count?: number;
};

export type UsageSchemaType = CreateUsageProps & {
  _id: string;
  time: Date;
};

export type UsageItemType = {
  id: string;
  time: Date;
  appName: string;
  source: UsageSchemaType['source'];
  totalPoints: number;
  list: UsageSchemaType['list'];
  sourceMember: SourceMemberType;
};
