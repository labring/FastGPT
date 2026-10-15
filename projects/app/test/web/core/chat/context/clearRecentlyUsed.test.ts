import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextSelector } from 'use-context-selector';
import {
  ChatPageContext,
  ChatPageContextProvider,
  type ChatPageContextValue
} from '@/web/core/chat/context/chatPageContext';

const mocks = vi.hoisted(() => ({
  getRecentlyUsedApps: vi.fn(),
  clearRecentlyUsedApps: vi.fn(),
  replace: vi.fn(),
  setSource: vi.fn(),
  setAppId: vi.fn(),
  setLastPane: vi.fn(),
  setLastChatAppId: vi.fn()
}));

vi.mock('@/web/core/chat/api', () => ({
  getRecentlyUsedApps: mocks.getRecentlyUsedApps,
  clearRecentlyUsedApps: mocks.clearRecentlyUsedApps,
  getChatSetting: vi.fn()
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { isPlus: false } })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: { team: { tmbId: 'member' } } })
}));
vi.mock('@/web/core/chat/context/useChatStore', () => ({
  useChatStore: () => ({ ...mocks, lastPane: 'aa', appId: '' })
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ query: { pane: 'aa' }, replace: mocks.replace })
}));
vi.mock('@fastgpt/web/hooks/useRequest', async () => {
  const { useRequest } = await import('ahooks');
  return {
    useRequest: (
      service: Parameters<typeof useRequest>[0],
      options: Parameters<typeof useRequest>[1]
    ) => useRequest(service, { manual: true, ...options })
  };
});
vi.mock('@fastgpt/web/hooks/useMemoEnhance', async () => {
  const { useMemo } = await import('react');
  return { useMemoEnhance: useMemo };
});

const recentApp = { appId: 'recent', name: 'Recent', avatar: 'recent.svg' };

describe('clearing recently used apps', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLDivElement;
  let context: ChatPageContextValue;

  const Observer = () => {
    context = useContextSelector(ChatPageContext, (value) => value);
    return null;
  };

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://fastgpt.example'
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.getRecentlyUsedApps.mockResolvedValue([recentApp]);
    mocks.clearRecentlyUsedApps.mockResolvedValue(null);
    mocks.replace.mockResolvedValue(true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      const providerProps = { appId: '', children: React.createElement(Observer) };
      root.render(React.createElement(ChatPageContextProvider, providerProps));
    });
    expect(context.myApps).toEqual([recentApp]);
    mocks.getRecentlyUsedApps.mockResolvedValue([]);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('keeps the list until deletion succeeds, then clears records', async () => {
    let finish!: () => void;
    mocks.clearRecentlyUsedApps.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    const clearing = context.clearRecentlyUsed();
    expect(context.myApps).toEqual([recentApp]);
    await act(async () => {
      finish();
      await clearing;
    });
    expect(context.myApps).toEqual([]);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('preserves the list on failure and allows a later retry', async () => {
    const error = new Error('offline');
    mocks.clearRecentlyUsedApps.mockRejectedValueOnce(error);
    await act(async () => {
      await expect(context.clearRecentlyUsed()).rejects.toBe(error);
    });
    expect(context.myApps).toEqual([recentApp]);
    await act(async () => context.clearRecentlyUsed());
    expect(context.myApps).toEqual([]);
  });

  it('ignores an older fetch completing after a successful clear', async () => {
    let finish!: (apps: (typeof recentApp)[]) => void;
    mocks.getRecentlyUsedApps.mockReturnValueOnce(
      new Promise<(typeof recentApp)[]>((resolve) => {
        finish = resolve;
      })
    );
    await act(async () => context.refreshRecentlyUsed('new'));
    expect(mocks.getRecentlyUsedApps).toHaveBeenCalledTimes(2);
    expect(finish).toBeTypeOf('function');
    await act(async () => context.clearRecentlyUsed());
    expect(context.myApps).toEqual([]);
    await act(async () => finish([recentApp]));
    expect(context.myApps).toEqual([]);
  });

  it('can show newly used apps after clearing', async () => {
    await act(async () => context.clearRecentlyUsed());
    mocks.getRecentlyUsedApps.mockResolvedValue([recentApp]);
    await act(async () => context.refreshRecentlyUsed('recent'));
    expect(context.myApps).toEqual([recentApp]);
  });

  it('does not update the list if deletion finishes after leaving the page', async () => {
    let finish!: () => void;
    mocks.clearRecentlyUsedApps.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    const clearing = context.clearRecentlyUsed();
    await act(async () => root.unmount());
    await act(async () => {
      finish();
      await clearing;
      await vi.advanceTimersByTimeAsync(30001);
    });
    expect(mocks.getRecentlyUsedApps).toHaveBeenCalledTimes(1);
  });
});
