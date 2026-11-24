import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppDetailPanelModal, {
  APP_DETAIL_PANEL_TRANSITION_MS,
  usePanelContentMounted
} from '@/pageComponents/app/detail/components/AppDetailPanelModal';

vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const Container = ({
    children,
    onClick,
    opacity,
    pointerEvents
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    opacity?: number;
    pointerEvents?: string;
  }) =>
    createElement(
      'div',
      { onClick, 'data-opacity': opacity, 'data-pointer-events': pointerEvents },
      children
    );
  return {
    Box: Container,
    Flex: Container,
    FocusLock: Container,
    usePrefersReducedMotion: () => true
  };
});
vi.mock('@fastgpt/web/components/common/MyBox', async () => {
  const { createElement, forwardRef } = await import('react');
  const MockMyBox = forwardRef<HTMLDivElement, { children?: React.ReactNode; tabIndex?: number }>(
    ({ children, tabIndex }, ref) =>
      createElement('div', { ref, tabIndex, 'data-panel-box': 'true' }, children)
  );
  MockMyBox.displayName = 'MockMyBox';
  return {
    default: MockMyBox
  };
});

describe('调试侧栏 Escape', () => {
  let dom: JSDOM;
  let root: Root;
  const close = vi.fn();
  const exitFullscreen = vi.fn();

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    close.mockReset();
    exitFullscreen.mockReset();
    root = createRoot(document.getElementById('root')!);
  });

  afterEach(() => {
    act(() => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('全屏时退出全屏，普通侧栏关闭', () => {
    const render = (fullscreen: boolean) =>
      act(() =>
        root.render(
          React.createElement(
            AppDetailPanelModal,
            {
              isOpen: true,
              onClose: close,
              onEscape: fullscreen ? exitFullscreen : undefined,
              width: '400px',
              height: '100vh',
              header: '调试'
            },
            '聊天'
          )
        )
      );
    const escape = () =>
      act(() =>
        document.dispatchEvent(
          new dom.window.KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true
          })
        )
      );
    render(true);
    escape();
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    render(false);
    escape();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('聊天已消费的 Escape 和内层弹窗不会关闭侧栏', () => {
    act(() =>
      root.render(
        React.createElement(
          AppDetailPanelModal,
          {
            isOpen: true,
            onClose: close,
            onEscape: exitFullscreen,
            width: '400px',
            height: '100vh',
            header: '调试'
          },
          '聊天'
        )
      )
    );
    const event = new dom.window.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    });
    event.preventDefault();
    act(() => {
      document.dispatchEvent(event);
    });
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    act(() => {
      document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
    });
    expect(exitFullscreen).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('后台侧栏忽略全屏调试的 Escape', () => {
    act(() =>
      root.render(
        React.createElement(
          AppDetailPanelModal,
          {
            isOpen: true,
            onClose: close,
            width: '400px',
            height: '100vh',
            header: '侧栏'
          },
          '内容'
        )
      )
    );
    const fullscreen = document.createElement('div');
    fullscreen.setAttribute('data-debug-fullscreen', 'true');
    document.body.appendChild(fullscreen);
    act(() => {
      document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
    });
    expect(close).not.toHaveBeenCalled();
  });

  it('关闭后遮罩仍可渐隐且不再拦截点击', () => {
    const render = (isOpen: boolean) =>
      act(() =>
        root.render(
          React.createElement(
            AppDetailPanelModal,
            {
              isOpen,
              onClose: close,
              width: '400px',
              height: '100vh',
              header: '调试'
            },
            '聊天'
          )
        )
      );
    render(true);
    const mask = document.querySelector('[data-pointer-events="auto"]');
    expect(mask?.getAttribute('data-opacity')).toBe('1');
    act(() => {
      mask?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    expect(close).toHaveBeenCalledTimes(1);
    render(false);
    expect(
      document.querySelector('[data-pointer-events="none"]')?.getAttribute('data-opacity')
    ).toBe('0');
  });

  it('全屏遮罩可退出全屏而不关闭侧栏', () => {
    act(() =>
      root.render(
        React.createElement(
          AppDetailPanelModal,
          {
            isOpen: true,
            onClose: close,
            onEscape: exitFullscreen,
            maskProps: { onClick: exitFullscreen },
            width: '400px',
            height: '100vh',
            header: '调试'
          },
          '聊天'
        )
      )
    );
    const mask = document.querySelector('[data-pointer-events="auto"]');
    act(() => {
      mask?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('隐藏的外部弹窗不阻断全屏 Escape，且 trapFocus 仅接管外部焦点', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    const hiddenDialog = document.createElement('div');
    hiddenDialog.setAttribute('role', 'dialog');
    hiddenDialog.setAttribute('aria-modal', 'true');
    hiddenDialog.setAttribute('aria-hidden', 'true');
    document.body.appendChild(hiddenDialog);

    const renderPanel = (trapFocus: boolean) =>
      act(() =>
        root.render(
          React.createElement(
            AppDetailPanelModal,
            {
              isOpen: true,
              onClose: close,
              onEscape: exitFullscreen,
              trapFocus,
              width: '400px',
              height: '100vh',
              header: '调试'
            },
            React.createElement('button', { 'data-testid': 'chat-action' }, '发送')
          )
        )
      );

    renderPanel(true);
    const panel = document.querySelector('[data-panel-box="true"]');
    expect(document.activeElement).toBe(panel);

    act(() => {
      document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
    });
    expect(exitFullscreen).toHaveBeenCalledTimes(1);

    const action = document.querySelector<HTMLButtonElement>('[data-testid="chat-action"]')!;
    act(() => action.focus());
    renderPanel(false);
    renderPanel(true);
    expect(document.activeElement).toBe(action);
  });
});

const PanelContentProbe = () => {
  const [isOpen, setIsOpen] = useState(false);
  const isContentMounted = usePanelContentMounted(isOpen);

  return React.createElement(
    'button',
    {
      'data-mounted': isContentMounted,
      onClick: () => setIsOpen((value) => !value)
    },
    isContentMounted ? 'content' : null
  );
};

describe('usePanelContentMounted', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('mounts on the first open and unmounts after the close transition', async () => {
    await act(async () => root.render(React.createElement(PanelContentProbe)));
    const button = container.querySelector('button')!;

    expect(button.dataset.mounted).toBe('false');

    await act(async () => button.click());
    expect(button.dataset.mounted).toBe('true');
    expect(button.textContent).toBe('content');

    await act(async () => button.click());
    expect(button.dataset.mounted).toBe('true');

    await act(async () => vi.advanceTimersByTime(APP_DETAIL_PANEL_TRANSITION_MS));
    expect(button.dataset.mounted).toBe('false');
    expect(button.textContent).toBe('');
  });
});
