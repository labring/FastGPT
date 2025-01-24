import { UsageSourceEnum } from './constants';
import { UsageListItemCountType, UsageListItemType } from './type';

export type CreateTrainingUsageProps = {
  name: string;
  datasetId: string;
};

export type GetUsageProps = {
  dateStart: Date;
  dateEnd: Date;
  sources?: UsageSourceEnum[];
  teamMemberIds?: string[];
  projectName?: string;
  appNameMap: Record<string, string>;
  sourcesMap: Record<string, { label: string }>;
  title: string;
};

export type GetUsageDashboardProps = GetUsageProps & {
  unit: 'day' | 'month';
};
export type GetUsageDashboardResponseItem = {
  date: Date;
  totalPoints: number;
};

export type ConcatUsageProps = UsageListItemCountType & {
  teamId: string;
  tmbId: string;
  billId?: string;
  totalPoints: number;
  listIndex?: number;
};

export type CreateUsageProps = {
  teamId: string;
  tmbId: string;
  appName: string;
  appId?: string;
  pluginId?: string;
  totalPoints: number;
  source: `${UsageSourceEnum}`;
  list: UsageListItemType[];
};
