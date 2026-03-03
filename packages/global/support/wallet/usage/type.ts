import type { SourceMemberType } from '../../../support/user/type';
import type { UsageItemTypeEnum, UsageSourceEnum } from './constants';

export type UsageSchemaType = {
  _id: string;
  time: Date;

  teamId: string;
  tmbId: string;
  appName: string;
  totalPoints: number;
  source: `${UsageSourceEnum}`;

  appId?: string;
  datasetId?: string;

  // @deprecated
  list?: UsageItemType[];
};
export type UsageItemSchemaType = {
  _id: string;
  teamId: string;
  usageId: string;
  name: string;
  amount: number;
  time: Date;
  itemType?: UsageItemTypeEnum; // Use in usage concat
} & UsageItemCountType;

export type UsageItemCountType = {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  charsLength?: number;
  duration?: number;
  pages?: number;
  count?: number; // Times

  // deprecated
  tokens?: number;
};

export type UsageItemType = UsageItemCountType & {
  moduleName: string;
  amount: number;
  itemType?: UsageItemTypeEnum;
};

export type UsageListItemType = {
  id: string;
  time: Date;
  appName: string;
  source: UsageSchemaType['source'];
  totalPoints: number;
  list: Omit<UsageItemType, 'itemType'>[];
  sourceMember: SourceMemberType;
};
