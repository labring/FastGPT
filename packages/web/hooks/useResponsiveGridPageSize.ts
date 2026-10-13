import { useBreakpointValue } from '@chakra-ui/react';

export type ResponsiveGridColumns = {
  base: number;
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
  '2xl'?: number;
};

/**
 * 根据网格列数计算基础分页数量，保证数据完整占据网格行。
 */
export const getGridPageSize = (columnCount: number, basePageSize = 50) => {
  const safeColumnCount = Number.isFinite(columnCount) ? Math.max(Math.floor(columnCount), 1) : 1;
  const totalPageSize = Math.ceil(basePageSize / safeColumnCount);

  return Math.max(totalPageSize * safeColumnCount, 1);
};

/**
 * 计算资源网格的请求数量。首请求需要为顶部的新增卡片预留一个槽位，后续请求使用基础数量。
 */
export const getGridRequestPageSize = (pageSize: number, offset: number) =>
  offset === 0 ? Math.max(pageSize - 1, 1) : pageSize;

/**
 * 复用 Chakra 响应式断点计算资源网格列数和对应的分页数量。
 */
export const useResponsiveGridPageSize = (columns: ResponsiveGridColumns) => {
  const columnCount = useBreakpointValue(columns, { ssr: false }) ?? columns.base;

  return {
    columnCount,
    pageSize: getGridPageSize(columnCount)
  };
};
