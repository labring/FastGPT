import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { useContextSelector } from 'use-context-selector';

const mocks = vi.hoisted(() => ({ poll: vi.fn(), setHistories: vi.fn(), initialStatus: 0 }));
vi.mock('@/web/core/chat/history/api', () => ({
  getChatHistoryStatus: mocks.poll,
  getChatHistories: vi.fn(),
  putChatHistory: vi.fn(),
  delChatHistoryById: vi.fn(),
  delClearChatHistories: vi.fn()
}));
vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, replace: vi.fn() }) }));
vi.mock('@fastgpt/web/hooks/useScrollPagination', () => {
  const histories = [
    { appId: 'app', chatId: 'chat', title: 'Chat', updateTime: new Date(), chatGenerateStatus: 0 }
  ];
  const skillHistories = histories.map(({ appId, ...item }) => ({ ...item, skillId: 'skill' }));
  return {
    useScrollPagination: (_fetch: unknown, { params }: { params: { skillId?: string } }) => {
      // 使用真实 state/setter，覆盖状态切换引发的 effect 清理与重新轮询。
      const [data, setData] = React.useState(() =>
        (params.skillId ? skillHistories : histories).map((item) => ({
          ...item,
          chatGenerateStatus: mocks.initialStatus
        }))
      );
      const setHistories = React.useCallback((update: React.SetStateAction<typeof data>) => {
        mocks.setHistories(update);
        setData(update);
      }, []);

      return {
        ScrollData: () => null,
        isLoading: false,
        isInitialLoading: false,
        setData: setHistories,
        setTotal: vi.fn(),
        fetchData: vi.fn(),
        data
      };
    }
  };
});

describe('chat history lease polling lifecycle', () => {
  let dom: JSDOM;
  let root: Root | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poll.mockReset();
    mocks.initialStatus = ChatGenerateStatusEnum.generating;
    dom = new JSDOM('<div id="root"></div>', { url: 'https://fastgpt.example' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('localStorage', dom.window.localStorage);
    vi.stubGlobal('sessionStorage', dom.window.sessionStorage);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    vi.useFakeTimers();
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    vi.useRealTimers();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('ignores a polling failure after unmount', async () => {
    const pending = Promise.withResolvers<{ list: any[] }>();
    mocks.poll.mockReturnValueOnce(pending.promise);
    await act(async () =>
      root!.render(
        React.createElement(
          ChatContextProvider,
          { params: { appId: 'app' } } as React.ComponentProps<typeof ChatContextProvider>,
          null
        )
      )
    );
    await act(async () => {
      root!.unmount();
      root = undefined;
    });
    mocks.setHistories.mockClear();
    await act(async () => {
      pending.reject(new Error('Status request unavailable'));
      await pending.promise.catch(() => undefined);
    });
    expect(mocks.setHistories).not.toHaveBeenCalled();
  });

  it.each([ChatGenerateStatusEnum.generating, ChatGenerateStatusEnum.done])(
    'preserves status %s on failure, retries silently and stops after a successful idle read',
    async (initialStatus) => {
      mocks.initialStatus = initialStatus;
      mocks.poll.mockRejectedValue(new Error('Network unavailable'));
      const Status = () => {
        const status = useContextSelector(
          ChatContext,
          (context) => context.histories[0]?.chatGenerateStatus
        );
        return React.createElement('output', null, status);
      };
      await act(async () =>
        root!.render(
          React.createElement(
            ChatContextProvider,
            { params: { appId: 'app' } } as React.ComponentProps<typeof ChatContextProvider>,
            React.createElement(Status)
          )
        )
      );
      expect(document.querySelector('output')?.textContent).toBe(`${initialStatus}`);
      expect(mocks.setHistories).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(mocks.poll).toHaveBeenCalledTimes(2);
      expect(mocks.setHistories).not.toHaveBeenCalled();
      expect(document.querySelector('output')?.textContent).toBe(`${initialStatus}`);
      const failedCalls = mocks.poll.mock.calls.length;

      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(mocks.poll).toHaveBeenCalledTimes(failedCalls);

      // 不触发 visibilitychange，证明网络恢复后由定时重试更新状态。
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      mocks.poll.mockResolvedValue({
        list: [{ chatId: 'chat', chatGenerateStatus: ChatGenerateStatusEnum.generating }]
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(mocks.poll.mock.calls.length).toBeGreaterThan(failedCalls);
      expect(document.querySelector('output')?.textContent).toBe(
        `${ChatGenerateStatusEnum.generating}`
      );

      // 已有成功快照后发生错误，同样不能覆盖状态或其他元数据。
      mocks.setHistories.mockClear();
      mocks.poll.mockRejectedValue(new Error('Redis unavailable'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(mocks.setHistories).not.toHaveBeenCalled();
      expect(document.querySelector('output')?.textContent).toBe(
        `${ChatGenerateStatusEnum.generating}`
      );

      mocks.poll.mockResolvedValue({
        list: [{ chatId: 'chat', chatGenerateStatus: ChatGenerateStatusEnum.done }]
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(document.querySelector('output')?.textContent).toBe(`${ChatGenerateStatusEnum.done}`);
      const idleCalls = mocks.poll.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });
      expect(mocks.poll).toHaveBeenCalledTimes(idleCalls);

      await act(async () => {
        document.dispatchEvent(new dom.window.Event('visibilitychange'));
      });
      expect(mocks.poll).toHaveBeenCalledTimes(idleCalls + 1);
    }
  );

  it.each([
    ['app', { appId: 'app' }],
    ['skill', { skillId: 'skill' }],
    ['builder', { appId: 'app', sourceType: ChatSourceTypeEnum.workflowBuilder }],
    ['helper', { appId: 'app', sourceType: ChatSourceTypeEnum.chatAgentHelper }]
  ] as const)(
    'does not overlap %s refreshes and ignores a response after unmount',
    async (_source, params) => {
      const first = Promise.withResolvers<{ list: any[] }>();
      const second = Promise.withResolvers<{ list: any[] }>();
      mocks.poll.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      await act(async () =>
        root!.render(
          React.createElement(
            ChatContextProvider,
            { params } as React.ComponentProps<typeof ChatContextProvider>,
            null
          )
        )
      );
      expect(mocks.poll).toHaveBeenCalledOnce();
      expect(mocks.poll).toHaveBeenCalledWith(expect.objectContaining(params));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(mocks.poll).toHaveBeenCalledOnce();

      await act(async () => {
        first.resolve({
          list: [{ chatId: 'chat', chatGenerateStatus: ChatGenerateStatusEnum.generating }]
        });
        await first.promise;
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4999);
      });
      expect(mocks.poll).toHaveBeenCalledOnce();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(mocks.poll).toHaveBeenCalledTimes(2);
      await act(async () => {
        root!.unmount();
        root = undefined;
      });
      mocks.setHistories.mockClear();
      await act(async () => {
        second.resolve({
          list: [{ chatId: 'chat', chatGenerateStatus: ChatGenerateStatusEnum.done }]
        });
        await second.promise;
      });
      expect(mocks.setHistories).not.toHaveBeenCalled();
    }
  );
});
