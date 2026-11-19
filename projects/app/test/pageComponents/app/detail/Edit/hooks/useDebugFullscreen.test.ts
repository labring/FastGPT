import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDebugFullscreen } from '@/pageComponents/app/detail/Edit/hooks/useDebugFullscreen';

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
});
