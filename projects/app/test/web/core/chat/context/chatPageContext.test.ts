import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useContextSelector } from 'use-context-selector';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatPageContext,
  ChatPageContextProvider,
  type ChatPageContextValue
} from '@/web/core/chat/context/chatPageContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import { createJSONStorage } from '@fastgpt/web/common/zustand';
import type { GetRecentlyUsedAppsResponseType } from '@fastgpt/global/openapi/core/chat/api';

const mocks = vi.hoisted(() => ({
  getRecent: vi.fn(),
  getSetting: vi.fn(),
  router: { query: { pane: 'ra' }, replace: vi.fn() },
  toast: vi.fn()
}));
vi.mock('@/web/core/chat/api', () => ({
  getRecentlyUsedApps: mocks.getRecent,
  getChatSetting: mocks.getSetting
}));
vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

const app = (appId: string): GetRecentlyUsedAppsResponseType[number] => ({
  appId,
  name: appId,
  avatar: 'avatar.svg'
});
const originalUser = useUserStore.getState();
const originalSystem = useSystemStore.getState();
const originalChat = useChatStore.getState();
const originalUserStorage = useUserStore.persist?.getOptions().storage;
const originalSystemStorage = useSystemStore.persist?.getOptions().storage;
const originalChatStorage = useChatStore.persist?.getOptions().storage;
const user = (tmbId: string) =>
  ({ team: { tmbId } }) as NonNullable<ReturnType<typeof useUserStore.getState>['userInfo']>;

describe('ChatPageContext recently used apps', () => {
  let dom: JSDOM;
  let root: Root;
  let context: ChatPageContextValue;

  const Harness = () => {
    context = useContextSelector(ChatPageContext, (value) => value);
    return null;
  };
  const render = async () =>
    act(async () =>
      root.render(
        React.createElement(
          ChatPageContextProvider,
          { appId: 'A' } as React.ComponentProps<typeof ChatPageContextProvider>,
          React.createElement(Harness)
        )
      )
    );
  const finishChat = async (appId: string) => act(async () => context.refreshRecentlyUsed(appId));

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', { url: 'https://fastgpt.example' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    // Node 的 Web Storage 占位对象不可写，持久化 store 使用真实 JSDOM storage。
    useUserStore.persist?.setOptions({ storage: createJSONStorage(() => dom.window.localStorage) });
    useSystemStore.persist?.setOptions({
      storage: createJSONStorage(() => dom.window.localStorage)
    });
    useChatStore.persist?.setOptions({
      storage: createJSONStorage(() => dom.window.sessionStorage)
    });
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.getRecent.mockResolvedValue([app('A'), app('B')]);
    mocks.getSetting.mockResolvedValue({ appId: 'hidden', enableHome: true, quickAppList: [] });
    mocks.router.replace.mockResolvedValue(true);
    useUserStore.setState({ userInfo: user('member') });
    useSystemStore.setState({ feConfigs: { ...originalSystem.feConfigs, isPlus: false } });
    useChatStore.setState({ appId: 'A', lastPane: ChatSidebarPaneEnum.RECENTLY_USED_APPS });
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    useUserStore.setState(originalUser);
    useSystemStore.setState(originalSystem);
    useChatStore.setState(originalChat);
    useUserStore.persist?.setOptions({ storage: originalUserStorage });
    useSystemStore.persist?.setOptions({ storage: originalSystemStorage });
    useChatStore.persist?.setOptions({ storage: originalChatStorage });
    vi.clearAllTimers();
    vi.useRealTimers();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('loads on entry without polling, refreshing or reordering when opening apps', async () => {
    await render();
    expect(mocks.getRecent).toHaveBeenCalledOnce();
    expect(context.myApps.map((item) => item.appId)).toEqual(['A', 'B']);

    await act(async () => {
      await context.handlePaneChange(ChatSidebarPaneEnum.RECENTLY_USED_APPS, 'B');
      await context.handlePaneChange(ChatSidebarPaneEnum.RECENTLY_USED_APPS, 'C');
      await vi.advanceTimersByTimeAsync(90000);
    });
    expect(mocks.getRecent).toHaveBeenCalledOnce();
    expect(context.myApps.map((item) => item.appId)).toEqual(['A', 'B']);
  });

  it('does not refresh for conversations in apps already present in the list', async () => {
    await render();
    await finishChat('B');
    await finishChat('A');
    expect(mocks.getRecent).toHaveBeenCalledOnce();
    expect(context.myApps.map((item) => item.appId)).toEqual(['A', 'B']);
  });

  it('refreshes once for a new app and deduplicates calls while the request is pending', async () => {
    await render();
    let resolve: (apps: GetRecentlyUsedAppsResponseType) => void = () => {};
    mocks.getRecent.mockReturnValueOnce(
      new Promise<GetRecentlyUsedAppsResponseType>((done) => {
        resolve = done;
      })
    );
    await finishChat('C');
    await finishChat('C');
    expect(mocks.getRecent).toHaveBeenCalledTimes(2);
    expect(context.myApps.map((item) => item.appId)).toEqual(['A', 'B']);

    await act(async () => resolve([app('C'), app('A'), app('B')]));
    await finishChat('C');
    expect(mocks.getRecent).toHaveBeenCalledTimes(2);
    expect(context.myApps.map((item) => item.appId)).toEqual(['C', 'A', 'B']);
  });

  it('allows the next conversation to retry when refreshing fails', async () => {
    await render();
    mocks.getRecent.mockRejectedValueOnce(new Error('offline'));
    await finishChat('C');
    expect(context.myApps.map((item) => item.appId)).toEqual(['A', 'B']);
    mocks.getRecent.mockResolvedValueOnce([app('C'), app('A')]);
    await finishChat('C');
    expect(mocks.getRecent).toHaveBeenCalledTimes(3);
    expect(context.myApps[0].appId).toBe('C');
  });

  it('allows retry when a successful response does not contain the new app yet', async () => {
    await render();
    await finishChat('C');
    mocks.getRecent.mockResolvedValueOnce([app('C'), app('A')]);
    await finishChat('C');
    expect(mocks.getRecent).toHaveBeenCalledTimes(3);
    expect(context.myApps[0].appId).toBe('C');
  });

  it('keeps the hidden home app out of the list and skips invalid app ids', async () => {
    useSystemStore.setState({ feConfigs: { ...originalSystem.feConfigs, isPlus: true } });
    mocks.getRecent.mockResolvedValueOnce([app('hidden'), app('A')]);
    await render();
    expect(context.myApps.map((item) => item.appId)).toEqual(['A']);
    await finishChat('hidden');
    await finishChat('');
    expect(mocks.getRecent).toHaveBeenCalledOnce();
  });

  it('reloads the list when entering the page again', async () => {
    await render();
    await act(async () => root.unmount());
    mocks.getRecent.mockResolvedValueOnce([app('B'), app('A')]);
    root = createRoot(document.getElementById('root')!);
    await render();
    expect(mocks.getRecent).toHaveBeenCalledTimes(2);
    expect(context.myApps.map((item) => item.appId)).toEqual(['B', 'A']);
  });

  it('loads for the new member and keeps missing-app refreshes isolated by member', async () => {
    await render();
    mocks.getRecent.mockResolvedValueOnce([app('C'), app('A')]);
    await finishChat('C');
    mocks.getRecent.mockResolvedValueOnce([app('D')]);
    await act(async () => useUserStore.setState({ userInfo: user('other member') }));
    expect(context.myApps.map((item) => item.appId)).toEqual(['D']);
    mocks.getRecent.mockResolvedValueOnce([app('C'), app('D')]);
    await finishChat('C');
    expect(mocks.getRecent).toHaveBeenCalledTimes(4);
    expect(context.myApps[0].appId).toBe('C');
  });

  it('waits for the signed-in member before loading', async () => {
    useUserStore.setState({ userInfo: null });
    await render();
    await finishChat('C');
    expect(mocks.getRecent).not.toHaveBeenCalled();
    await act(async () => useUserStore.setState({ userInfo: user('member') }));
    expect(mocks.getRecent).toHaveBeenCalledOnce();
  });
});
