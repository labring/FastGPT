import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MenuProps } from '@chakra-ui/react';

/**
 * 保留列表到退出动画结束，再释放 Popper 的监听；MenuButton 保持挂载以维持焦点。
 */
export const useMenuListPresence = (isOpen: boolean) => {
  const [mounted, setMounted] = useState(false);
  const isMounted = isOpen || mounted;
  const destroyPopper = useRef<() => void>();
  const modifiers = useMemo<MenuProps['modifiers']>(
    () => [
      {
        name: 'trackMenuPopper',
        enabled: true,
        phase: 'write',
        effect: ({ instance }) => {
          destroyPopper.current = instance.destroy;
        }
      }
    ],
    []
  );

  useEffect(() => {
    if (isMounted) return;
    destroyPopper.current?.();
    destroyPopper.current = undefined;
  }, [isMounted]);

  const mount = useCallback(() => {
    setMounted(true);
  }, []);

  const onAnimationComplete = useCallback(() => {
    if (!isOpen) {
      setMounted(false);
    }
  }, [isOpen]);

  return {
    isMounted,
    modifiers,
    mount,
    onAnimationComplete
  };
};
