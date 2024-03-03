import { CreateUsageProps } from './api';
import { UsageSourceEnum } from './constants';

export type UsageListItemCountType = {
  tokens?: number;
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
  time: Date;
  appName: string;
  source: UsageSchemaType['source'];
  totalPoints: number;
  list: UsageSchemaType['list'];
};
