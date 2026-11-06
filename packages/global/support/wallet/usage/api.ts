import type { UsageItemTypeEnum } from './constants';
import type { UsageCommonFilters, UsageSubjectFilter } from './filter';
import type { UsageItemCountType, UsageItemType, UsageSchemaType } from './type';

type LegacyUsageFilterProps = {
  dateStart?: UsageCommonFilters['dateStart'];
  dateEnd?: UsageCommonFilters['dateEnd'];
  sources?: UsageCommonFilters['sources'];
  teamMemberIds?: string[];
  projectName?: UsageCommonFilters['projectName'];
  subjectFilter?: UsageSubjectFilter;
};

export type GetUsageProps = LegacyUsageFilterProps;
export type GetUsageDashboardProps = LegacyUsageFilterProps & {
  dateStart: UsageCommonFilters['dateStart'];
  dateEnd: UsageCommonFilters['dateEnd'];
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
