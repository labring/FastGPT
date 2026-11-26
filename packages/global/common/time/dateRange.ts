/** 按本地日历日期生成完整闭区间；复制输入，避免修改组件状态或调用方的 Date。 */
export const getLocalDateRange = (from: Date, to: Date) => {
  const start = new Date(from);
  const end = new Date(to);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { from: start, to: end };
};
