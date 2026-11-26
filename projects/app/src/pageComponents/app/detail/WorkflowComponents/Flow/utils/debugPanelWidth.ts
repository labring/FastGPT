/** 按热区左沿限制宽度；屏幕不足以容纳最小宽度时优先保留左侧空间。 */
export const getDebugPanelWidth = ({
  width,
  minWidth,
  viewportWidth,
  leftBoundary
}: {
  width: number;
  minWidth: number;
  viewportWidth: number;
  leftBoundary: number;
}) => {
  if (!viewportWidth) return minWidth;
  return Math.min(Math.max(width, minWidth), Math.max(0, viewportWidth - leftBoundary - 16));
};
