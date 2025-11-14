import type { UsageItemTypeEnum, UsageSourceEnum } from './constants';
import type { UsageItemCountType, UsageItemType, UsageListItemType, UsageSchemaType } from './type';

export type CreateTrainingUsageProps = {
  name: string;
  datasetId: string;
};

export type GetUsageProps = {
  dateStart: string;
  dateEnd: string;
  sources?: UsageSourceEnum[];
  teamMemberIds?: string[];
  projectName?: string;
};

export type GetUsageDashboardProps = GetUsageProps & {
  unit: 'day' | 'month';
};
export type GetUsageDashboardResponseItem = {
  date: Date;
  totalPoints: number;
};

export type CreateUsageProps = Omit<UsageSchemaType, '_id' | 'time'>;
export type ConcatUsageProps = {
  teamId: string;
  usageId: string;
  totalPoints: number;
  itemType: UsageItemTypeEnum;
} & UsageItemCountType;
export type PushUsageItemsProps = {
  teamId: string;
  usageId: string;
  list: UsageItemType[];
};
