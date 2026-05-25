import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import type { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { MemberFilterType } from '@fastgpt/global/support/wallet/usage/api';

export type UnitType = 'day' | 'month';

export type UsageFilterParams = {
  dateRange: DateRangeType;
  memberFilter?: MemberFilterType;
  isSelectAllTmb: boolean;
  usageSources: UsageSourceEnum[];
  isSelectAllSource: boolean;
  projectName: string;
  unit: UnitType;
};
