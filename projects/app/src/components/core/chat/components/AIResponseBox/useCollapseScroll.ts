import { useCallback, useEffect, useRef } from 'react';

/**
 * 仅在标题已吸顶时，收起后将所属滚动容器定位到该项标题。
 * ref 绑定普通文档流中的 AccordionItem，首个子元素为吸顶标题。
 * onCollapseChange 必须在更新折叠状态前调用，才能判断标题是否已偏离原位置。
 * 遵循 scroll-margin-top 为外层吸顶标题留位，避免收起后被遮挡。
 * 下一帧读取折叠后的布局，只滚动最近的纵向滚动容器，展开和卸载时取消待执行定位。
 */
export const useCollapseScroll = () => {
  const collapseRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>();

  const onCollapseChange = useCallback((index: number | number[]) => {
    if (frameRef.current !== undefined) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    }

    const isExpanded = Array.isArray(index) ? index.length > 0 : index === 0;
    if (isExpanded) return;

    const item = collapseRef.current;
    const header = item?.firstElementChild;
    if (!item || !header || getComputedStyle(header).position !== 'sticky') return;

    // 声明 sticky 不代表已吸顶；标题被推离所属项起点后，收起才需要回到原位置。
    if (header.getBoundingClientRect().top <= item.getBoundingClientRect().top) return;

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = undefined;
      const item = collapseRef.current;
      if (!item) return;

      let container = item.parentElement;
      while (container) {
        if (['auto', 'scroll', 'overlay'].includes(getComputedStyle(container).overflowY)) {
          const scrollMarginTop = Number.parseFloat(getComputedStyle(item).scrollMarginTop) || 0;
          const offset =
            item.getBoundingClientRect().top -
            container.getBoundingClientRect().top -
            container.clientTop -
            scrollMarginTop;
          container.scrollTo({ top: container.scrollTop + offset, behavior: 'auto' });
          return;
        }
        container = container.parentElement;
      }
    });
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  return { collapseRef, onCollapseChange };
};
