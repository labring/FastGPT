import dayjs from 'dayjs';
import { createContext, useContext } from 'react';

export type DateRange = 7 | 30 | 90 | 360;
export type Granularity = 'day' | 'month' | 'quarter';
export type DashboardFilters = { dateRange: DateRange; granularity: Granularity };

export const defaultDashboardFilters: DashboardFilters = { dateRange: 7, granularity: 'day' };

/** 校验数据面板筛选值，近七天仅允许按天统计。 */
export const normalizeDashboardFilters = (value: Partial<DashboardFilters>): DashboardFilters => {
  const dateRange: DateRange = [7, 30, 90, 360].includes(value.dateRange as DateRange)
    ? (value.dateRange as DateRange)
    : 7;
  const granularity: Granularity =
    dateRange === 7
      ? 'day'
      : value.granularity === 'month' || value.granularity === 'quarter'
        ? value.granularity
        : 'day';
  return { dateRange, granularity };
};

export const DashboardFiltersContext = createContext<{
  filters: DashboardFilters;
  updateFilters: (patch: Partial<DashboardFilters>) => void;
} | null>(null);

/** 同一路由下的筛选器和图表共享状态；持久化由 SingleSelectFilter 负责。 */
export const useDashboardFilters = () => {
  const context = useContext(DashboardFiltersContext);
  if (!context) throw new Error('Dashboard filters provider is required');
  return { ...context.filters, updateFilters: context.updateFilters };
};

/** 补齐后端已聚合的周期空桶；完整年月日作为键，避免跨年同一天碰撞。 */
export const formatList2ChartsData = <T extends { date: string }>(
  sourceData: T[] | undefined,
  {
    defaultValues,
    startTime,
    granularity = 'day',
    now = dayjs().format()
  }: {
    defaultValues: Omit<T, 'date'>;
    startTime: string;
    granularity?: Granularity;
    now?: string;
  }
) => {
  // pro 服务不可达时 /proApi 静默降级，sourceData 可能为 undefined；按空数组处理保证图表骨架可渲染
  // 接口日期是日历标签（UTC 零点），不能再按浏览器时区平移。
  const sourceMap = new Map((sourceData || []).map((item) => [item.date.slice(0, 10), item]));
  const start = dayjs(startTime);
  const first = (() => {
    if (granularity === 'day') return start.startOf('day');
    if (granularity === 'month') return start.startOf('month');
    return start.startOf('year').month(Math.floor(start.month() / 3) * 3);
  })();
  const unit = granularity === 'day' ? 'day' : 'month';
  const step = granularity === 'quarter' ? 3 : 1;
  const length = Math.max(0, Math.floor(dayjs(now).diff(first, unit) / step) + 1);
  return Array.from({ length }, (_, index) => {
    const date = first.add(index * step, unit);
    const key = date.format('YYYY-MM-DD');
    const label = (() => {
      if (granularity === 'month') return date.format('YYYY/MM');
      if (granularity === 'quarter') return `${date.year()} Q${Math.floor(date.month() / 3) + 1}`;
      return date.format('YYYY/MM/DD');
    })();
    // SAFETY: 图表组件约定行数据统一带 date/x/xLabel；T 是含 date 的行类型，补全后与调用方的图表数据契约一致
    return {
      ...defaultValues,
      ...sourceMap.get(key),
      date: label,
      x: label,
      xLabel: label
    } as unknown as T;
  });
};

/** 最近 N 个自然日含今天；非 7 天范围的起点扩展到所在月 1 日，终点仍为今天。 */
export const getStartTime = (dateRange: DateRange, now = dayjs().format()): string => {
  const start = dayjs(now).subtract(dateRange - 1, 'day');
  return start.startOf(dateRange === 7 ? 'day' : 'month').format();
};
