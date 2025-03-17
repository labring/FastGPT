import { SourceMemberType } from '../../../support/user/type';
import { CreateUsageProps } from './api';
import { UsageSourceEnum } from './constants';

export type UsageListItemCountType = {
  inputTokens?: number;
  outputTokens?: number;
  charsLength?: number;
  duration?: number;
  pages?: number;

  // deprecated
  tokens?: number;
};

export type UsageListItemType = UsageListItemCountType & {
  moduleName: string;
  amount: number;
  model?: string;
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
