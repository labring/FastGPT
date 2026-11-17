import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import DebugFullscreenContainer from '@/pageComponents/app/detail/Edit/components/DebugFullscreenContainer';
import { useDebugFullscreen } from '@/pageComponents/app/detail/Edit/hooks/useDebugFullscreen';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const Container = ({
    children,
    onAnimationEnd,
    role
  }: {
    children?: React.ReactNode;
    onAnimationEnd?: React.AnimationEventHandler;
    role?: string;
  }) => createElement('div', { onAnimationEnd, role }, children);
  return {
    Box: Container,
    Flex: Container,
    FocusLock: Container,
    Portal: Container,
    usePrefersReducedMotion: () => false
  };
});

describe('DebugFullscreenContainer', () => {
  it('切换全屏和完成退出动画时保留聊天输入节点', () => {
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(document.getElementById('root')!);
    const Preview = () => {
      const fullscreen = useDebugFullscreen();
      return React.createElement(
        DebugFullscreenContainer,
        { fullscreen },
        React.createElement('input', { defaultValue: '草稿' }),
        React.createElement('button', { onClick: fullscreen.toggle }, '切换')
      );
    };
    act(() => root.render(React.createElement(Preview)));
    const input = document.querySelector('input')!;
    const button = document.querySelector('button')!;
    act(() => button.click());
    expect(document.querySelector('[role="dialog"]')?.contains(input)).toBe(true);
    act(() => button.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    act(() =>
      document
        .querySelector('[role="dialog"]')
        ?.dispatchEvent(new dom.window.Event('animationend', { bubbles: true }))
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('input')).toBe(input);
    expect(input.value).toBe('草稿');
    act(() => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });
});
