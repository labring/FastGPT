import { useEffect, type RefObject } from 'react';

/** 在 React Flow 节点或画布拖拽区域、引用元素之外按下时调用关闭处理。 */
export const useCloseOnFlowNodeDragAreaPointerDown = <T extends HTMLElement>(
  ref: RefObject<T>,
  handler: (event: Event) => void,
  enabled: boolean
) => {
  useEffect(() => {
    if (!enabled) return;

    const onPointerDown = (event: PointerEvent) => {
      const path = event.composedPath();
      if (
        (ref.current && path.includes(ref.current)) ||
        path.some(
          (target) => target instanceof HTMLElement && target.classList.contains('nodrag')
        ) ||
        !path.some(
          (target) =>
            target instanceof HTMLElement &&
            (target.classList.contains('react-flow__node') ||
              target.classList.contains('react-flow__pane'))
        )
      ) {
        return;
      }

      handler(event);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [enabled, handler, ref]);
};
