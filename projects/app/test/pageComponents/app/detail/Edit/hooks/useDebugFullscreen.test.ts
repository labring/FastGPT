import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hasBlockingModalDialog,
  useDebugFullscreen
} from '@/pageComponents/app/detail/Edit/hooks/useDebugFullscreen';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('@chakra-ui/react', () => ({ usePrefersReducedMotion: () => motion.reduced }));

describe('调试全屏动画', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    motion.reduced = false;
  });

  it('退出时等待动画结束，保留聊天输入', () => {
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(document.getElementById('root')!);
    const Preview = () => {
      const { isFullscreen, isClosing, toggle, onAnimationEnd } = useDebugFullscreen();
      return React.createElement(
        'div',
        { onAnimationEnd, 'data-full': isFullscreen, 'data-closing': isClosing },
        React.createElement('input', { defaultValue: '草稿' }),
        React.createElement('button', { onClick: toggle }, '切换')
      );
    };
    act(() => root.render(React.createElement(Preview)));
    const panel = document.querySelector('[data-full]')!;
    const input = panel.querySelector('input')!;
    const button = panel.querySelector('button')!;
    act(() => button.click());
    expect(panel.getAttribute('data-full')).toBe('true');
    act(() =>
      document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    );
    expect(panel.getAttribute('data-closing')).toBe('true');
    expect(panel.getAttribute('data-full')).toBe('true');
    act(() => panel.dispatchEvent(new dom.window.Event('animationend', { bubbles: true })));
    expect(panel.getAttribute('data-full')).toBe('false');
    expect(panel.querySelector('input')).toBe(input);
    expect(input.value).toBe('草稿');
    act(() => root.unmount());
    dom.window.close();
  });

  it('hasBlockingModalDialog 仅识别可见的外部模态弹窗', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);

    const createDialog = () => {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      return dialog;
    };

    expect(hasBlockingModalDialog()).toBe(false);

    const selfFullscreen = createDialog();
    selfFullscreen.setAttribute('data-debug-fullscreen', 'true');
    document.body.appendChild(selfFullscreen);
    expect(hasBlockingModalDialog()).toBe(false);

    const hiddenAria = createDialog();
    hiddenAria.setAttribute('aria-hidden', 'true');
    document.body.appendChild(hiddenAria);
    expect(hasBlockingModalDialog()).toBe(false);

    const hiddenWrapper = document.createElement('div');
    hiddenWrapper.style.display = 'none';
    hiddenWrapper.appendChild(createDialog());
    document.body.appendChild(hiddenWrapper);
    expect(hasBlockingModalDialog()).toBe(false);

    const invisibleDialog = createDialog();
    invisibleDialog.style.visibility = 'hidden';
    document.body.appendChild(invisibleDialog);
    expect(hasBlockingModalDialog()).toBe(false);

    const visibleDialog = createDialog();
    document.body.appendChild(visibleDialog);
    expect(hasBlockingModalDialog()).toBe(true);

    dom.window.close();
  });

  it('animationend 未触发时通过兜底计时器退出全屏', () => {
    vi.useFakeTimers();
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(document.getElementById('root')!);
    const Preview = () => {
      const { isFullscreen, isClosing, toggle } = useDebugFullscreen();
      return React.createElement(
        'div',
        { 'data-full': isFullscreen, 'data-closing': isClosing },
        React.createElement('button', { onClick: toggle }, '切换')
      );
    };
    try {
      act(() => root.render(React.createElement(Preview)));
      const panel = document.querySelector('[data-full]')!;
      const button = panel.querySelector('button')!;
      act(() => button.click());
      expect(panel.getAttribute('data-full')).toBe('true');

      act(() =>
        document.dispatchEvent(
          new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        )
      );
      expect(panel.getAttribute('data-closing')).toBe('true');
      expect(panel.getAttribute('data-full')).toBe('true');

      act(() => vi.advanceTimersByTime(300));
      expect(panel.getAttribute('data-closing')).toBe('false');
      expect(panel.getAttribute('data-full')).toBe('false');
    } finally {
      act(() => root.unmount());
      dom.window.close();
      vi.useRealTimers();
    }
  });
});
