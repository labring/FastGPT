import { useMemo } from 'react';

export const useWidthVariable = <T = any>({
  width,
  widthList = [900, 1200, 1500, 1800, 2100],
  list
}: {
  width: number;
  widthList?: number[];
  list: T[];
}) => {
  const value = useMemo(() => {
    // 根据 width 计算，找到第一个大于 width 的值
    const reversedWidthList = [...widthList].reverse();
    const reversedList = [...list].reverse();
    const index = reversedWidthList.findIndex((item) => width > item);

    if (index === -1) {
      return reversedList[0];
    }
    return reversedList[index];
  }, [list, width, widthList]);

  return value;
};
