import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';

/** 最近七个本地自然日含今天，按日历日期计算并补齐首尾边界。 */
export const getDefaultAuditDateRange = (now = new Date()): DateRangeType => {
  const from = new Date(now);
  from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return { from, to };
};
