import { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';

export type UsageFilterParams = {
  dateRange: DateRangeType;
  selectTmbIds: string[];
  isSelectAllTmb: boolean;
  usageSources: UsageSourceEnum[];
  isSelectAllSource: boolean;
  projectName: string;
};
