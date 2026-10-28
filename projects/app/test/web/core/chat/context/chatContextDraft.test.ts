import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useContextSelector } from 'use-context-selector';
import { createJSONStorage } from '@fastgpt/web/common/zustand';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import {
  clearChatInputDrafts,
  getChatInputDraftEpoch,
  readChatInputDraft,
  saveChatInputDraft
} from '@/web/core/chat/inputDraft/storage';

const mocks = vi.hoisted(() => ({ remove: vi.fn(), clear: vi.fn(), toast: vi.fn() }));
vi.mock('@/web/core/chat/history/api', () => ({
  delChatHistoryById: mocks.remove,
  delClearChatHistories: mocks.clear,
  putChatHistory: vi.fn(),
  getChatHistories: vi.fn(),
  getChatHistoryStatus: vi.fn()
}));
vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, replace: vi.fn() }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

const identity = { tmbId: 'member', appId: 'app', chatId: 'A' };
const originalUserStorage = useUserStore.persist?.getOptions().storage;
const makeUser = (tmbId: string) =>
  ({ team: { tmbId } }) as NonNullable<ReturnType<typeof useUserStore.getState>['userInfo']>;

describe('history deletion draft ownership', () => {
  let dom: JSDOM;
  let root: Root;
  let remove: (chatId: string) => Promise<undefined>;
  let clear: () => Promise<undefined>;
  const Harness = () => {
    remove = useContextSelector(ChatContext, (value) => value.onDelHistory);
    clear = useContextSelector(ChatContext, (value) => value.onClearHistories);
    return null;
  };
  const render = async (appId = 'app', tmbId = 'member') => {
    await act(async () => {
      useUserStore.setState({ userInfo: makeUser(tmbId) });
      root.render(
        React.createElement(
          ChatContextProvider,
          { params: { appId }, disabled: true } as React.ComponentProps<typeof ChatContextProvider>,
          React.createElement(Harness)
        )
      );
    });
  };
  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', { url: 'https://fastgpt.example' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('localStorage', dom.window.localStorage);
    vi.stubGlobal('sessionStorage', dom.window.sessionStorage);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    // 模块导入时没有 Web Storage 的 Node 会使用内存 store，不安装 persist 接口。
    // 已安装 persist 时改用本测例的真实 JSDOM 存储，避免 Node 占位对象。
    useUserStore.persist?.setOptions({ storage: createJSONStorage(() => dom.window.localStorage) });
    vi.clearAllMocks();
    clearChatInputDrafts();
    useChatStore.setState({ chatId: 'A', outLinkAuthData: undefined });
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    clearChatInputDrafts();
    useUserStore.persist?.setOptions({ storage: originalUserStorage });
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('clears only the deleted conversation in the original app after an app switch', async () => {
    const completion = Promise.withResolvers<void>();
    mocks.remove.mockReturnValueOnce(completion.promise);
    saveChatInputDraft({ identity, text: 'original app draft', files: [] });
    const other = { ...identity, appId: 'other app' };
    saveChatInputDraft({ identity: other, text: 'other app draft', files: [] });
    await render();
    let request: Promise<undefined> = Promise.resolve(undefined);
    await act(async () => {
      request = remove('A');
    });
    await render('other app');
    await act(async () => {
      completion.resolve();
      await request;
    });
    expect(readChatInputDraft(identity)).toBeUndefined();
    expect(readChatInputDraft(other)?.text).toBe('other app draft');
  });

  it('clears the original member app scope when the member changes during history cleanup', async () => {
    const completion = Promise.withResolvers<void>();
    mocks.clear.mockReturnValueOnce(completion.promise);
    saveChatInputDraft({ identity, text: 'A', files: [] });
    saveChatInputDraft({ identity: { ...identity, chatId: 'B' }, text: 'B', files: [] });
    const other = { ...identity, tmbId: 'other member' };
    saveChatInputDraft({ identity: other, text: 'other member draft', files: [] });
    await render();
    let request: Promise<undefined> = Promise.resolve(undefined);
    await act(async () => {
      request = clear();
    });
    await render('app', 'other member');
    await act(async () => {
      completion.resolve();
      await request;
    });
    expect(readChatInputDraft(identity)).toBeUndefined();
    expect(readChatInputDraft({ ...identity, chatId: 'B' })).toBeUndefined();
    expect(readChatInputDraft(other)?.text).toBe('other member draft');
  });

  it('preserves drafts and callback ownership when remote deletion fails', async () => {
    mocks.remove.mockRejectedValueOnce(new Error('offline'));
    saveChatInputDraft({ identity, text: 'keep', files: [] });
    const epoch = getChatInputDraftEpoch(identity);
    await render();
    await act(async () => {
      await expect(remove('A')).rejects.toThrow('offline');
    });
    expect(readChatInputDraft(identity)?.text).toBe('keep');
    expect(getChatInputDraftEpoch(identity)).toBe(epoch);
  });
});
