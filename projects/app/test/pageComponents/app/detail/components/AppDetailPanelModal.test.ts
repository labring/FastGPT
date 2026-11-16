import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppDetailPanelModal from '@/pageComponents/app/detail/components/AppDetailPanelModal';

vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const Container = ({ children }: { children?: React.ReactNode }) =>
    createElement('div', null, children);
  return {
    Box: Container,
    Flex: Container,
    FocusLock: Container,
    usePrefersReducedMotion: () => true
  };
});
vi.mock('@fastgpt/web/components/common/MyBox', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ children }: { children?: React.ReactNode }) => createElement('div', null, children)
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
});
