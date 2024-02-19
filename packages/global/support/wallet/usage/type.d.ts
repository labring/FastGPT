import { CreateUsageProps } from './api';
import { UsageSourceEnum } from './constants';

export type UsageListItemCountType = {
  inputTokens?: number;
  outputTokens?: number;
  charsLength?: number;
  duration?: number;
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
  // memberName: string;
  time: Date;
  appName: string;
  source: UsageSchemaType['source'];
  total: number;
  list: UsageSchemaType['list'];
};
