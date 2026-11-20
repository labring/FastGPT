import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WholeResponseModal from '@/components/core/chat/components/WholeResponseModal';

vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const Container = ({ children }: { children?: React.ReactNode }) =>
    createElement('div', null, children);
  return {
    Box: Container,
    Flex: Container,
    CloseButton: ({ onClick }: { onClick: () => void }) =>
      createElement('button', { onClick, 'data-action': 'close' }),
    usePrefersReducedMotion: () => false
  };
});
vi.mock('@fastgpt/web/components/v2/common/MyModal', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ isOpen, onClose, onCloseComplete, title, children }: any) =>
      createElement(
        'div',
        { 'data-open': String(isOpen) },
        title,
        children,
        createElement('button', { 'data-action': 'dismiss', onClick: onClose }),
        createElement('button', { 'data-action': 'animation-end', onClick: onCloseComplete })
      )
  };
});
vi.mock('@/components/common/FullscreenButton', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ isFullscreen, onClick }: { isFullscreen: boolean; onClick: () => void }) =>
      createElement('button', {
        'data-action': 'fullscreen',
        'data-full': String(isFullscreen),
        onClick
      })
  };
});
vi.mock('use-context-selector', () => ({
  useContextSelector: () => ({ getHistoryResponseData: () => [] })
}));
vi.mock('@/components/core/chat/ChatContainer/ChatBox/Provider', () => ({ ChatBoxContext: {} }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ loading: false, data: [] })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/EmptyTip', () => ({ default: () => null }));
vi.mock('@/components/core/chat/components/WholeResponseModal/ResponseBox', () => ({
  ResponseBox: () => null
}));
vi.mock('@/components/core/chat/components/WholeResponseModal/WholeResponseContent', () => ({
  WholeResponseContent: () => null
}));

describe('WholeResponseModal close', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('全屏时先缩小，关闭时等退出动画完成再通知父组件', () => {
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(document.getElementById('root')!);
    const onClose = vi.fn();
    act(() => root.render(React.createElement(WholeResponseModal, { dataId: 'test', onClose })));
    const click = (action: string) =>
      act(() => (document.querySelector(`[data-action="${action}"]`) as HTMLButtonElement).click());
    click('fullscreen');
    expect(document.querySelector('[data-full]')?.getAttribute('data-full')).toBe('true');
    click('dismiss');
    expect(document.querySelector('[data-full]')?.getAttribute('data-full')).toBe('false');
    expect(document.querySelector('[data-open]')?.getAttribute('data-open')).toBe('true');
    click('close');
    expect(document.querySelector('[data-open]')?.getAttribute('data-open')).toBe('false');
    expect(onClose).not.toHaveBeenCalled();
    click('animation-end');
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    dom.window.close();
  });
});
