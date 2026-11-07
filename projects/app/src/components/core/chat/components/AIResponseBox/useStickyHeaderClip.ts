import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * 为原生滚动裁剪提供标题占用高度和窗口尺寸，保留透明面板原有的画布底色。
 * itemRef 的首个子元素为标题，返回的 ref 绑定使用 processingContentClipStyle 的详情面板。
 * 仅在挂载及尺寸变化时测量，不监听滚动或逐帧读写详情位置。
 */
export const useStickyHeaderClip = (itemRef: RefObject<HTMLElement>) => {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentVersion, setContentVersion] = useState(0);
  const setContent = useCallback((node: HTMLDivElement | null) => {
    if (contentRef.current === node) return;
    contentRef.current = node;
    // 节点替换也需重新绑定，不能只记录“是否展开”。
    setContentVersion((version) => version + 1);
  }, []);

  useBrowserLayoutEffect(() => {
    const content = contentRef.current;
    const item = itemRef.current;
    const header = item?.firstElementChild;
    if (!content || !item || !header) return;

    const syncClipSize = () => {
      const stickyTop = Number.parseFloat(getComputedStyle(header).top) || 0;
      const inset = stickyTop + header.getBoundingClientRect().height;
      content.style.setProperty('--processing-clip-top', `${inset}px`);
      // 使用同一窗口高度做正反位移，避免内容边距或内部滚动造成位移偏差。
      content.style.setProperty(
        '--processing-clip-height',
        `${content.getBoundingClientRect().height}px`
      );
    };

    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(syncClipSize);
    observer?.observe(header);
    observer?.observe(content);
    window.addEventListener('resize', syncClipSize);
    syncClipSize();

    return () => {
      window.removeEventListener('resize', syncClipSize);
      observer?.disconnect();
      content.style.removeProperty('--processing-clip-top');
      content.style.removeProperty('--processing-clip-height');
    };
  }, [contentVersion, itemRef]);

  return setContent;
};
