import { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';

export type UnitType = 'day' | 'month';

export type UsageFilterParams = {
  dateRange: DateRangeType;
  selectTmbIds: string[];
  isSelectAllTmb: boolean;
  usageSources: UsageSourceEnum[];
  isSelectAllSource: boolean;
  projectName: string;
  unit: UnitType;
};
