import dayjs from 'dayjs';
import type { UsageCommonFilters } from '@fastgpt/global/support/wallet/usage/filter';
import type { UsageFilterParams } from '@/pageComponents/account/usage/type';
import { toMultiSelectFilterQuery } from '@fastgpt/web/components/common/TagFilter/multiSelectFilterUtils';

/** 复制日期并统一自然日闭区间，查询和 CSV 共用，绝不修改日期选择器中的 Date。 */
export const serializeUsageFilters = ({
  dateRange,
  sourceFilter,
  projectName
}: Pick<UsageFilterParams, 'dateRange' | 'sourceFilter' | 'projectName'>): UsageCommonFilters => ({
  dateStart: dayjs(dateRange.from ?? new Date())
    .startOf('day')
    .format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
  dateEnd: dayjs(dateRange.to ?? new Date())
    .endOf('day')
    .format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
  sources: toMultiSelectFilterQuery(sourceFilter),
  projectName
});
