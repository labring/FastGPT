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
    onClick,
    role,
    sx
  }: {
    children?: React.ReactNode;
    onAnimationEnd?: React.AnimationEventHandler;
    onClick?: React.MouseEventHandler;
    role?: string;
    sx?: Record<string, unknown>;
  }) =>
    createElement(
      'div',
      {
        onAnimationEnd,
        onClick,
        role,
        'data-mask': onClick ? 'true' : undefined,
        'data-focus-guard-rule': sx?.['& > div:not([data-focus-guard])'] ? 'true' : undefined
      },
      children
    );
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
    expect(document.querySelector('[data-focus-guard-rule="true"]')).not.toBeNull();
    const input = document.querySelector('input')!;
    const button = document.querySelector('button')!;
    act(() => button.click());
    expect(document.querySelector('[role="dialog"]')?.contains(input)).toBe(true);
    const mask = document.querySelector('[data-mask="true"]');
    expect(mask).toBeDefined();
    act(() => mask?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
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
