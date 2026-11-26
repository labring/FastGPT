import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import type { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { MultiSelectFilterValue } from '@fastgpt/web/components/common/TagFilter';

export type UnitType = 'day' | 'month';

export type UsageFilterParams = {
  dateRange: DateRangeType;
  sourceFilter: MultiSelectFilterValue<UsageSourceEnum>;
  projectName: string;
  unit: UnitType;
};
