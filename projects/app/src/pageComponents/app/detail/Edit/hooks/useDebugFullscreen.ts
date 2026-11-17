import { useCallback, useEffect, useState } from 'react';
import { keyframes } from '@emotion/react';
import { usePrefersReducedMotion } from '@chakra-ui/react';

const enter = keyframes`from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); }`;
const exit = keyframes`from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.96); }`;

/** 全屏关闭动画结束后再恢复侧栏，保持聊天组件和输入状态。 */
export const useDebugFullscreen = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const close = useCallback(() => {
    if (prefersReducedMotion) setIsFullscreen(false);
    else setIsClosing(true);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([data-debug-fullscreen])'))
        return;
      event.stopPropagation();
      close();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isFullscreen, close]);

  return {
    isFullscreen,
    isClosing,
    prefersReducedMotion,
    close,
    animation:
      isFullscreen && !prefersReducedMotion
        ? `${isClosing ? exit : enter} 200ms ease both`
        : undefined,
    toggle: () => {
      if (isFullscreen) close();
      else {
        setIsClosing(false);
        setIsFullscreen(true);
      }
    },
    onAnimationEnd: (event: React.AnimationEvent) => {
      if (event.target === event.currentTarget && isClosing) {
        setIsFullscreen(false);
        setIsClosing(false);
      }
    }
  };
};
