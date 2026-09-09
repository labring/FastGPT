import dayjs from 'dayjs';

export type DateRange = 7 | 30 | 90 | 180;

// Date mapping helper function
export const formatList2ChartsData = <T extends { date: string }>(
  sourceData: T[] | undefined,
  defaultValues: Record<string, number>,
  startTime: string
): T[] => {
  // 接口未迁移（404 降级）时 sourceData 可能为 undefined，按空数组处理保证图表骨架可渲染
  const formatResponse = (sourceData || []).map((item) => ({
    ...item,
    date: dayjs(item.date).format('MM/DD')
  }));

  // Create complete date list
  const diff = dayjs().diff(dayjs(startTime).startOf('day'), 'day') + 1;
  const completeDateList = Array.from({ length: diff }, (_, i) =>
    dayjs(startTime).add(i, 'day').format('MM/DD')
  );

  return completeDateList.map((date) => {
    const existingData = formatResponse.find((item) => item.date === date);
    // SAFETY: 图表组件约定行数据统一带 date/x/xLabel，T 为含 date 字段的行类型，此处补全后结构兼容
    return {
      ...(existingData || { date, ...defaultValues }),
      date,
      x: date,
      xLabel: date
    } as unknown as T;
  });
};

export const getStartTime = (dateRange: DateRange): string => {
  return dayjs().subtract(dateRange, 'day').add(1, 'day').startOf('day').format();
};
