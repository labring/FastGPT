import { useCallback, useEffect, useState } from 'react';
import { keyframes } from '@emotion/react';
import { usePrefersReducedMotion } from '@chakra-ui/react';

const FULLSCREEN_ANIMATION_MS = 200;
const enter = keyframes`from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); }`;
const exit = keyframes`from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.96); }`;

const isDialogVisible = (dialog: HTMLElement) => {
  if (dialog.closest('[aria-hidden="true"], [hidden], [inert]')) return false;
  if (window.getComputedStyle(dialog).visibility === 'hidden') return false;
  for (let el: HTMLElement | null = dialog; el; el = el.parentElement) {
    if (window.getComputedStyle(el).display === 'none') return false;
  }
  return true;
};

/** 仅把可见且未隐藏的外部模态弹窗视为更高层对话框，避免残留隐藏节点阻断全屏 Escape。 */
export const hasBlockingModalDialog = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"][aria-modal="true"]:not([data-debug-fullscreen])'
    )
  ).some(isDialogVisible);

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
    if (!isClosing) return;
    // 后台标签页或动画被中断时 animationend 可能不触发，超时兜底确保全屏态能退出。
    const timer = window.setTimeout(() => {
      setIsFullscreen(false);
      setIsClosing(false);
    }, FULLSCREEN_ANIMATION_MS + 50);
    return () => window.clearTimeout(timer);
  }, [isClosing]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      if (hasBlockingModalDialog()) return;
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
        ? `${isClosing ? exit : enter} ${FULLSCREEN_ANIMATION_MS}ms ease both`
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
