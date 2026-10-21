import { useCallback, useEffect, useRef } from 'react';

/**
 * 收起处理项后，将所属滚动容器定位到该项标题。
 * ref 绑定普通文档流中的 AccordionItem，避免吸顶标题的位置掩盖内容原本的起点。
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

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = undefined;
      const item = collapseRef.current;
      if (!item) return;

      let container = item.parentElement;
      while (container) {
        if (['auto', 'scroll', 'overlay'].includes(getComputedStyle(container).overflowY)) {
          const offset =
            item.getBoundingClientRect().top -
            container.getBoundingClientRect().top -
            container.clientTop;
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
