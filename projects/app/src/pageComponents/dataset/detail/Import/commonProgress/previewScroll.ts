/** 切换预览文件时复位右侧滚动容器，避免新文件沿用上一文件的浏览位置。 */
export const resetPreviewScroll = (container: Pick<HTMLElement, 'scrollTop'> | null) => {
  if (!container) return;

  container.scrollTop = 0;
};
