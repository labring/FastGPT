import React, { act, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useForm } from 'react-hook-form';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextSelector } from 'use-context-selector';
import AppChatMain from '@/components/core/chat/ChatContainer/ChatBox/components/AppChatMain';
import type { ChatBoxInputFormType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import ChatRecordContextProvider, {
  ChatRecordContext
} from '@/web/core/chat/context/chatRecordContext';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { GetRecordsV2ResponseType } from '@fastgpt/global/openapi/core/chat/record/api';

// 全局服务端 setup 完成导入后，再为客户端 hook 提供 DOM，避免服务端环境变量被判定为客户端访问。
const dom = await vi.hoisted(async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://fastgpt.example'
  });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  return dom;
});

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@fastgpt/web/components/common/MyLoading', () => ({
  default: () => React.createElement('div', { 'data-loading-overlay': '' })
}));
vi.mock('@chakra-ui/react', () => {
  const Box = React.forwardRef<HTMLDivElement, React.PropsWithChildren<{ id?: string }>>(
    function Box({ children, id }, ref) {
      return React.createElement('div', { id, ref }, children);
    }
  );
  return { Box, Flex: Box };
});
vi.mock('@/components/core/chat/ChatContainer/ChatBox/components/WelcomeBox', () => ({
  default: () => null
}));
vi.mock('@/components/core/chat/ChatContainer/ChatBox/components/VariableInputForm', () => ({
  default: () => React.createElement('input', { defaultValue: 'draft' })
}));
vi.mock('@/components/core/chat/ChatContainer/ChatBox/components/ChatRecordsList', () => ({
  default: () => React.createElement('div', null, 'record')
}));
vi.mock('@/components/core/chat/QuickQuestionButton', () => ({ default: () => null }));

type FetchRecords = NonNullable<React.ComponentProps<typeof ChatRecordContextProvider>['fetchFn']>;
const params = { sourceType: ChatSourceTypeEnum.app, appId: 'app', chatId: 'chat' } as const;
const welcomeQuestions: string[] = [];
const boxBodyProps = { id: 'history-viewport' };
const noop = () => undefined;

describe('AppChatMain pagination through memo and chat context', () => {
  let root: Root;
  let container: HTMLDivElement;
  let scrollRef: React.RefObject<HTMLDivElement>;
  let requests: {
    params: Parameters<FetchRecords>[0];
    resolve: (value: GetRecordsV2ResponseType) => void;
  }[];
  let records: React.ComponentProps<typeof ChatRecordContext.Provider>['value'];
  const fetchRecords: FetchRecords = (params) =>
    new Promise((resolve) => requests.push({ params, resolve }));

  /** 使用真实 Context、hook 和 memo 主体，只替换与分页无关的消息及表单 UI。 */
  const Harness = () => {
    const value = useContextSelector(ChatRecordContext, (value) => value);
    records = value;
    const { chatRecords, itemRefs } = value;
    const chatForm = useForm<ChatBoxInputFormType>();
    const recordsListProps = useMemo(
      () => ({
        records: chatRecords,
        itemRefs,
        expandedDeletedGroups: new Set<string>(),
        enableTTS: false,
        enableSandbox: false,
        statusBoxData: undefined,
        questionGuides: [],
        onToggleDeletedGroup: noop,
        onRetry: noop,
        onEdit: noop
      }),
      [chatRecords, itemRefs]
    );
    return React.createElement(AppChatMain, {
      ScrollData: records.ScrollData,
      ScrollContainerRef: scrollRef,
      isLoading: records.isInitialLoadingRecords,
      paginationLoading: records.paginationLoading,
      welcomeQuestions,
      chatStarted: true,
      chatForm,
      chatType: ChatTypeEnum.chat,
      recordsListProps,
      boxBodyProps
    });
  };

  const render = async (hasMorePrev: boolean, hasMoreNext: boolean) => {
    /* eslint-disable react/no-children-prop -- Context Provider requires explicit children in typed createElement. */
    await act(async () => {
      root.render(
        React.createElement(ChatRecordContextProvider, {
          params,
          fetchFn: fetchRecords,
          children: React.createElement(Harness)
        })
      );
    });
    /* eslint-enable react/no-children-prop */
    expect(container.querySelector('[data-loading-overlay]')).not.toBeNull();
    await act(async () => {
      requests[0].resolve({
        list: [
          {
            id: 'record',
            dataId: 'record',
            obj: ChatRoleEnum.Human,
            value: [{ text: { content: 'record' } }]
          }
        ],
        total: 1,
        hasMorePrev,
        hasMoreNext
      });
    });
    return scrollRef.current!;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('FileList', dom.window.FileList);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 16)
    );
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    requests = [];
    scrollRef = React.createRef<HTMLDivElement>();
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  afterAll(() => dom.window.close());

  it.each(['prev', 'next'] as const)(
    'updates %s request text without changing records',
    async (direction) => {
      const viewport = await render(direction === 'prev', direction === 'next');
      Object.defineProperties(viewport, {
        scrollHeight: { value: 1000, configurable: true },
        clientHeight: { value: 200, configurable: true }
      });
      const draft = container.querySelector('input')!;
      draft.value = 'unsaved draft';
      const originalRecords = records.chatRecords;
      const originalComponent = records.ScrollData;
      await act(async () => {
        viewport.scrollTop = direction === 'prev' ? 0 : 800;
        viewport.dispatchEvent(new Event('scroll'));
        await vi.advanceTimersByTimeAsync(250);
      });

      expect(requests[1].params[direction === 'prev' ? 'prevId' : 'nextId']).toBe('record');
      expect(records.paginationLoading[direction]).toBe(true);
      expect(container.textContent).toContain('common:is_requesting');
      expect(container.querySelector('[data-loading-overlay]')).toBeNull();

      await act(async () => {
        requests[1].resolve({ list: [], total: 1, hasMorePrev: false, hasMoreNext: false });
      });
      expect(records.chatRecords).toBe(originalRecords);
      expect(container.textContent).not.toContain('common:is_requesting');
      expect(records.ScrollData).toBe(originalComponent);
      expect(scrollRef.current).toBe(viewport);
      expect(container.querySelector('input')).toBe(draft);
      expect(draft.value).toBe('unsaved draft');
      expect(viewport.scrollTop).toBe(direction === 'prev' ? 0 : 800);
    }
  );

  it('updates each direction while the other page is still pending', async () => {
    const viewport = await render(true, true);
    Object.defineProperties(viewport, {
      scrollHeight: { value: 200, configurable: true },
      clientHeight: { value: 200, configurable: true }
    });
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(requests).toHaveLength(3);
    expect(records.paginationLoading).toEqual({ prev: true, next: true });
    expect(container.textContent?.match(/common:is_requesting/g)).toHaveLength(2);

    await act(async () => {
      requests
        .find(({ params }) => params.prevId)
        ?.resolve({
          list: [
            {
              id: 'previous-record',
              dataId: 'previous-record',
              obj: ChatRoleEnum.Human,
              value: [{ text: { content: 'previous' } }]
            }
          ],
          total: 1,
          hasMorePrev: false,
          hasMoreNext: true
        });
    });
    expect(records.paginationLoading).toEqual({ prev: false, next: true });
    expect(container.textContent?.match(/common:is_requesting/g)).toHaveLength(1);

    await act(async () => {
      requests
        .find(({ params }) => params.nextId)
        ?.resolve({
          list: [
            {
              id: 'next-record',
              dataId: 'next-record',
              obj: ChatRoleEnum.Human,
              value: [{ text: { content: 'next' } }]
            }
          ],
          total: 1,
          hasMorePrev: false,
          hasMoreNext: false
        });
    });
    expect(records.chatRecords.map(({ id }) => id)).toEqual([
      'previous-record',
      'record',
      'next-record'
    ]);
    expect(records.paginationLoading).toEqual({ prev: false, next: false });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(requests).toHaveLength(3);
    expect(container.textContent).not.toContain('common:is_requesting');
    expect(container.querySelector('[data-loading-overlay]')).toBeNull();
  });
});
