import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * 同步分离式 Table 的表头与滚动表体。
 *
 * 表体出现纵向滚动条时返回扣除滚动条后的表头宽度；横向滚动时同步表头位置。
 * 可传入虚拟列表等场景已有的表体 ref，否则使用 Hook 内部创建的 ref。
 */
export const useFixedTableHeader = (externalBodyRef?: RefObject<HTMLDivElement>) => {
  const internalBodyRef = useRef<HTMLDivElement>(null);
  const headerContainerRef = useRef<HTMLDivElement>(null);
  const bodyContainerRef = externalBodyRef ?? internalBodyRef;
  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  useBrowserLayoutEffect(() => {
    const body = bodyContainerRef.current;
    const header = headerContainerRef.current;
    if (!body || !header) return;

    const updateScrollbarWidth = () => {
      setScrollbarWidth(body.offsetWidth - body.clientWidth);
    };
    const syncHorizontalScroll = () => {
      header.scrollLeft = body.scrollLeft;
    };
    updateScrollbarWidth();
    syncHorizontalScroll();

    const resizeObserver = new ResizeObserver(updateScrollbarWidth);
    resizeObserver.observe(body);
    body.addEventListener('scroll', syncHorizontalScroll, { passive: true });
    return () => {
      resizeObserver.disconnect();
      body.removeEventListener('scroll', syncHorizontalScroll);
    };
  }, [bodyContainerRef]);

  return {
    headerContainerRef,
    bodyContainerRef,
    headerTableWidth: scrollbarWidth > 0 ? `calc(100% - ${scrollbarWidth}px)` : '100%'
  };
};
