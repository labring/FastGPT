import React, { forwardRef, useEffect, useMemo, useState, type RefObject } from 'react';
import { MenuList, type MenuListProps, type MenuProps, useMenuContext } from '@chakra-ui/react';
import { useMemoizedFn } from 'ahooks';

const getCanvasViewport = (element: HTMLElement | null) =>
  element?.closest('.react-flow__viewport');

/** 菜单上下都放不下时，仍用 Popper 将它限制在视口内。 */
export const useCanvasMenuModifiers = ({
  isOpen,
  triggerRef,
  modifiers
}: {
  isOpen: boolean;
  triggerRef: RefObject<HTMLElement>;
  modifiers?: MenuProps['modifiers'];
}): MenuProps['modifiers'] => {
  const [isInCanvas, setIsInCanvas] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setIsInCanvas(Boolean(getCanvasViewport(triggerRef.current)));
    }
  }, [isOpen, triggerRef]);

  return useMemo(
    () =>
      isOpen && isInCanvas
        ? [
            ...(modifiers ?? []),
            { name: 'preventOverflow', options: { altAxis: true, tether: false, padding: 8 } }
          ]
        : modifiers,
    [isOpen, isInCanvas, modifiers]
  );
};

/** 菜单随画布缩放，视口移动时重新计算定位。 */
export const CanvasMenuList = forwardRef<HTMLDivElement, MenuListProps>(
  function CanvasMenuList(props, ref) {
    const { buttonRef, forceUpdate, isOpen } = useMenuContext();
    const updatePosition = useMemoizedFn(forceUpdate);

    useEffect(() => {
      if (!isOpen) return;
      const viewport = getCanvasViewport(buttonRef.current);
      if (!viewport) return;

      // React Flow 平移和缩放只更新 transform，Popper 的 scroll/resize 监听不会触发。
      const observer = new MutationObserver(updatePosition);
      observer.observe(viewport, { attributes: true, attributeFilter: ['style'] });
      return () => observer.disconnect();
    }, [buttonRef, isOpen, updatePosition]);

    return <MenuList {...props} ref={ref} />;
  }
);
