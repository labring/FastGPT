import { UsageSourceEnum } from './constants';
import { UsageListItemCountType, UsageListItemType } from './type';

export type CreateTrainingUsageProps = {
  name: string;
  datasetId: string;
};

export type GetTotalPointsProps = {
  dateStart: Date;
  dateEnd: Date;
  teamMemberIds: string[];
  sources: UsageSourceEnum[];
  unit: 'day' | 'week' | 'month';
};

export type GetUsageProps = {
  dateStart: Date;
  dateEnd: Date;
  sources?: UsageSourceEnum[];
  teamMemberIds?: string[];
  projectName?: string;
  isSelectAllTmb?: boolean;
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
