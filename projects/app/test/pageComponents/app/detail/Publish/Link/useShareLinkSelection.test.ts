import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useShareLinkSelection } from '@/pageComponents/app/detail/Publish/Link/useShareLinkSelection';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  error: vi.fn(),
  team: { teamId: 'team', tmbId: 'member' }
}));
vi.mock('@/web/support/outLink/api', () => ({ getShareChatList: mocks.list }));
vi.mock('@/web/support/user/useUserStore', () => {
  const state = () => ({ userInfo: { team: mocks.team } });
  return { useUserStore: Object.assign(state, { getState: state }) };
});

const link = { _id: 'link', teamId: 'team', isShowBrand: true };
let dom: JSDOM;
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let selection: ReturnType<typeof useShareLinkSelection>;
const settle = async () => {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
};
const render = async (appId = 'app') => {
  const TestComponent = () => {
    selection = useShareLinkSelection({ appId, onLoadError: mocks.error });
    return null;
  };
  await act(async () =>
    root.render(
      React.createElement(QueryClientProvider, { client }, React.createElement(TestComponent))
    )
  );
  await settle();
};

beforeEach(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.team = { teamId: 'team', tmbId: 'member' };
  mocks.list.mockReset().mockResolvedValue([link]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: 0 } },
    logger: { log: console.log, warn: console.warn, error: () => {} }
  });
  await render();
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  dom.window.close();
  vi.unstubAllGlobals();
});

describe('useShareLinkSelection', () => {
  it('opens with the refreshed preference instead of the previous list snapshot', async () => {
    mocks.list.mockResolvedValueOnce([{ ...link, isShowBrand: false }]);
    await act(async () => selection.openLink('link'));
    expect(selection.selectedLinkData?.isShowBrand).toBe(false);
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it.each([new Error('network failure'), []])(
    'does not open when refresh fails or the selected link was deleted',
    async (response) => {
      if (response instanceof Error) mocks.list.mockRejectedValueOnce(response);
      else mocks.list.mockResolvedValueOnce(response);
      await act(async () => selection.openLink('link'));
      expect(selection.selectedLinkData).toBeUndefined();
      expect(mocks.error).toHaveBeenCalledOnce();
    }
  );

  it('keeps the saved preference in cache if the subsequent refresh fails', async () => {
    await act(async () => selection.openLink('link'));
    mocks.list.mockRejectedValueOnce(new Error('refresh failed'));
    await act(async () => selection.onBrandSaved('link', false));
    await settle();
    expect(selection.selectedLinkData?.isShowBrand).toBe(false);
    expect(selection.shareChatList[0].isShowBrand).toBe(false);
  });

  it('does not let an older list request overwrite the saved preference', async () => {
    await act(async () => selection.openLink('link'));
    let finish!: (value: unknown) => void;
    mocks.list.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = selection.refetchShareChatList();
      await Promise.resolve();
    });
    mocks.list.mockRejectedValueOnce(new Error('refresh failed'));
    await act(async () => selection.onBrandSaved('link', false));
    await act(async () => finish([link]));
    await pending;
    await settle();
    expect(selection.selectedLinkData?.isShowBrand).toBe(false);
  });

  it('ignores a pending open after switching members', async () => {
    let finish!: (value: unknown) => void;
    mocks.list.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    let pending!: Promise<void>;
    await act(async () => {
      pending = selection.openLink('link');
      await Promise.resolve();
    });
    mocks.team = { teamId: 'other-team', tmbId: 'other-member' };
    await act(async () => finish([link]));
    await pending;
    await settle();
    expect(selection.selectedLinkData).toBeUndefined();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('does not reopen a selection after it is closed while loading', async () => {
    let finish!: (value: unknown) => void;
    mocks.list.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    let pending!: Promise<void>;
    await act(async () => {
      pending = selection.openLink('link');
      await Promise.resolve();
      selection.closeLink();
    });
    await act(async () => finish([link]));
    await pending;
    await settle();
    expect(selection.selectedLinkData).toBeUndefined();
  });
});
