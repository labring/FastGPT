import { useCallback, useState } from 'react';

/**
 * 保留 Menu 和 Popper 直到退出动画完成，再一起卸载，避免关闭时直接截断动画。
 */
export const useMenuListPresence = (isOpen: boolean) => {
  const [isMounted, setIsMounted] = useState(false);

  const mount = useCallback(() => {
    setIsMounted(true);
  }, []);

  const onAnimationComplete = useCallback(() => {
    if (!isOpen) {
      setIsMounted(false);
    }
  }, [isOpen]);

  return {
    isMounted: isOpen || isMounted,
    mount,
    onAnimationComplete
  };
};
