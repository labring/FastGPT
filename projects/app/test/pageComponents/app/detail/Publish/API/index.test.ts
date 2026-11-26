import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const permission = vi.hoisted(() => ({ canManage: true }));
vi.mock('use-context-selector', () => ({ useContextSelector: () => permission.canManage }));
vi.mock('@/pageComponents/app/detail/context', () => ({ AppContext: {} }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/EmptyTip', () => ({
  default: () => React.createElement('p', null, 'No access')
}));
vi.mock('@/components/support/apikey/Table', () => ({
  ApiKeyTableHeader: ({ title }: { title: React.ReactNode }) =>
    React.createElement('header', null, title),
  default: ({ keyType }: { keyType: string }) =>
    React.createElement(
      'section',
      { 'data-key-type': keyType },
      React.createElement('input', { defaultValue: '' })
    )
}));

describe('API key publishing selector', () => {
  let host: HTMLDivElement;
  let root: Root;
  let dom: JSDOM;
  let ChakraProvider: typeof import('@chakra-ui/react').ChakraProvider;
  let API: typeof import('@/pageComponents/app/detail/Publish/API').default;
  beforeEach(async () => {
    // App 测试先加载真实服务端 setup，再为页面测试安装浏览器对象。
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost',
      pretendToBeVisual: true
    });
    for (const key of [
      'window',
      'document',
      'navigator',
      'HTMLElement',
      'Node',
      'Event',
      'localStorage'
    ])
      vi.stubGlobal(key, key === 'window' ? dom.window : (dom.window as any)[key]);
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
    vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
    vi.stubGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
    dom.window.matchMedia = vi.fn(() => ({
      matches: false,
      addListener: () => {},
      removeListener: () => {}
    })) as any;
    ChakraProvider = (await import('@chakra-ui/react')).ChakraProvider;
    API = (await import('@/pageComponents/app/detail/Publish/API')).default;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });
  it.each([true, false])(
    'keeps selector focus while replacing protected table state; manager=%s',
    async (canManage) => {
      permission.canManage = canManage;
      await act(async () =>
        root.render(
          React.createElement(ChakraProvider, null, React.createElement(API, { appId: 'app' }))
        )
      );
      const [app, personal] = [...host.querySelectorAll('button')];
      const previousInput = host.querySelector('input');
      if (previousInput) previousInput.value = 'Old filter';
      else expect(host.textContent).toContain('No access');
      personal.focus();
      await act(async () => personal.click());
      expect(host.querySelectorAll('button')[1]).toBe(personal);
      expect(document.activeElement).toBe(personal);
      expect(personal.getAttribute('aria-pressed')).toBe('true');
      expect(host.querySelector('section')?.dataset.keyType).toBe('personal');
      expect(host.querySelector('input')).not.toBe(previousInput);
      expect(host.querySelector('input')!.value).toBe('');
      app.focus();
      await act(async () => app.click());
      expect(document.activeElement).toBe(app);
      expect(app.getAttribute('aria-pressed')).toBe('true');
      expect(host.querySelector('section')?.dataset.keyType).toBe(canManage ? 'app' : undefined);
    }
  );
});
