import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFetch } from '@/web/common/system/utils';
import { getLogKeys, searchAppChatLogs, updateLogKeys } from '@/web/core/app/api/log';

const getLogRows = vi.hoisted(() => vi.fn());
const getPaginationOptions = vi.hoisted(() => vi.fn());
const translate = vi.hoisted(() => vi.fn());

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('ahooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ahooks')>()),
  useDebounce: <T>(value: T) => value
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: {} })
}));
vi.mock('@/pageComponents/app/detail/context', () => ({ AppContext: {} }));
vi.mock('use-context-selector', () => ({ useContextSelector: () => 'App' }));
vi.mock('@/web/common/system/utils', () => ({ downloadFetch: vi.fn() }));
vi.mock('@/web/core/app/api/log', () => ({
  getLogKeys: vi.fn(async () => ({ logKeys: [] })),
  getAppChatLogs: vi.fn(),
  searchAppChatLogs: vi.fn(),
  updateLogKeys: vi.fn()
}));
vi.mock('@fastgpt/web/hooks/useRequest', async () => {
  const { useEffect, useRef, useState } = await import('react');
  return {
    useRequest: (fn: any, options: any = {}) => {
      const [data, setData] = useState();
      const runAsync = async (...args: any[]) => {
        const result = await fn(...args);
        setData(result);
        await options.onSuccess?.(result);
        return result;
      };
      const initial = useRef({ runAsync, manual: options.manual });
      useEffect(() => {
        if (initial.current.manual === false) void initial.current.runAsync();
      }, []);
      return { runAsync, data };
    }
  };
});
vi.mock('@fastgpt/web/hooks/usePagination', () => ({
  usePagination: (_api: unknown, options: unknown) => {
    getPaginationOptions(options);
    return {
      data: getLogRows(),
      Pagination: () => null,
      getData: vi.fn(),
      pageNum: 1,
      total: 1,
      pageSize: 20
    };
  }
}));
vi.mock('@fastgpt/web/hooks/useTableMultipleSelect', () => ({
  useTableMultipleSelect: () => ({
    selectedItems: [],
    setSelectedItems: vi.fn(),
    isSelecteAll: false,
    selectAllTrigger: vi.fn(),
    isSelected: () => false,
    getRowSelectionProps: (_item: any, props: any) => props,
    FloatingActionBar: () => null
  })
}));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({ openConfirm: () => () => {}, ConfirmModal: () => null })
}));
vi.mock('@fastgpt/web/components/common/FixedTable', async () => {
  const React = await import('react');
  return {
    FixedTableContainer: React.forwardRef(function FixedTableContainer(
      { children }: any,
      ref: any
    ) {
      return React.createElement('div', { ref }, children);
    })
  };
});
vi.mock('@fastgpt/web/components/common/DateRangePicker', () => ({ default: () => null }));
vi.mock('@/pageComponents/app/detail/Logs/UserFilter', () => ({
  default: () => null,
  parseUserKey: () => ({})
}));
vi.mock('@/pageComponents/app/detail/Logs/FeedbackTypeFilter', () => ({ default: () => null }));
vi.mock('@/pageComponents/app/detail/Logs/UserIpTypeFilter', () => ({ default: () => null }));
vi.mock('@/pageComponents/app/detail/Logs/ErrorCountFilter', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', async () => {
  const React = await import('react');
  return {
    default: ({ name, onClick }: any) =>
      onClick ? React.createElement('button', { onClick, 'aria-label': name }, name) : null
  };
});
vi.mock('@fastgpt/web/components/common/TagFilter', async () => {
  const React = await import('react');
  return {
    FilterInput: ({ value = '', onChange, ...props }: any) =>
      props.placeholder === 'app:logs_search_placeholder'
        ? React.createElement(
            'button',
            {
              ...props,
              onClick: () => onChange({ target: { value: 'needle' } }),
              'aria-label': props.placeholder
            },
            value
          )
        : React.createElement('input', { ...props, value, onChange }),
    MultiSelectFilter: () => null,
    createMultiSelectFilter: () => ({ mode: 'all', values: [] }),
    toMultiSelectFilterQuery: () => undefined,
    useCommonFilterLabels: () => ({})
  };
});
vi.mock('@fastgpt/web/components/common/Avatar', async () => {
  const React = await import('react');
  return { default: ({ src }: { src?: string }) => React.createElement('img', { src, alt: '' }) };
});
vi.mock('@fastgpt/web/components/common/MyPopover', async () => {
  const React = await import('react');
  return {
    default: ({ Trigger, children }: any) =>
      React.createElement('div', null, Trigger, children({ onClose: () => {} }))
  };
});
vi.mock('@fastgpt/web/components/common/MyPopover/PopoverConfirm', async () => {
  const React = await import('react');
  return {
    default: ({ content, onConfirm }: any) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement('span', { 'data-testid': 'export-confirm-content' }, content),
        React.createElement('button', { onClick: onConfirm }, 'confirm-export')
      )
  };
});
vi.mock('@fastgpt/web/components/common/DndDrag', async () => {
  const React = await import('react');
  const provided = {
    innerRef: () => {},
    draggableProps: {},
    dragHandleProps: {},
    droppableProps: {}
  };
  return {
    default: ({ children }: any) => children({ provided }),
    Draggable: ({ children }: any) =>
      React.createElement('div', null, children(provided, { isDragging: false }))
  };
});

describe('LogTable identity columns UI', () => {
  let LogTable: typeof import('@/pageComponents/app/detail/Logs/LogTable').default;
  let ChakraProvider: typeof import('@chakra-ui/react').ChakraProvider;
  let dom: JSDOM;
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://fastgpt.test',
      pretendToBeVisual: true
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('localStorage', dom.window.localStorage);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    vi.stubGlobal('dispatchEvent', dom.window.dispatchEvent.bind(dom.window));
    vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
    vi.stubGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
    dom.window.matchMedia = vi.fn(() => ({
      matches: false,
      addListener: () => {},
      removeListener: () => {}
    })) as any;
    ChakraProvider = (await import('@chakra-ui/react')).ChakraProvider;
    LogTable = (await import('@/pageComponents/app/detail/Logs/LogTable')).default;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.clear();
    vi.clearAllMocks();
    translate.mockImplementation((key: string) => key);
    vi.mocked(getLogKeys).mockResolvedValue({ logKeys: [] });
    getLogRows.mockReturnValue([
      {
        _id: 'row',
        chatId: 'chat',
        tmbId: 'member-a',
        source: 'api',
        outLinkUid: 'customer-42',
        sourceMember: { name: 'Member A', status: 'active' },
        authMember: { name: 'Member A', status: 'active' },
        title: 'Question'
      }
    ]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });
  const render = async (props: Record<string, unknown> = {}) => {
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          {},
          React.createElement(LogTable, {
            appId: 'app-1',
            pageSizeCacheKey: 'test',
            sourceFilter: { mode: 'all', values: [] },
            setSourceFilter: () => {},
            dateRange: { from: new Date(), to: new Date() },
            setDateRange: () => {},
            ...props
          })
        )
      )
    );
  };
  const click = async (element: Element | undefined | null) => {
    expect(element).toBeTruthy();
    await act(async () => element!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  };
  const setSearch = async () => {
    const input = container.querySelector('button[aria-label="app:logs_search_placeholder"]');
    expect(input).toBeTruthy();
    await act(async () => {
      input!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
  };
  const authorizerToggle = () =>
    [...container.querySelectorAll('button[aria-label="invisible"]')].find((button) =>
      button.parentElement?.textContent?.includes('app:logs_keys_auth_user')
    );
  it('shows a dash for internal entries and missing names, preserving actual channel names', async () => {
    localStorage.setItem('app_log_keys_app-1', JSON.stringify([{ key: 'source', enable: true }]));
    const base = getLogRows()[0];
    getLogRows.mockReturnValue(
      [
        { publishSource: { type: 'online' } },
        {
          publishSource: { type: 'online', name: 'Old app name' },
          sourceName: 'Legacy app name'
        },
        { publishSource: { type: 'api', id: 'deleted-key' } },
        { publishSource: { type: 'test' }, sourceName: '调试-对话' },
        { publishSource: { type: 'cronJob' }, sourceName: '定时任务应用名' },
        { publishSource: { type: 'api', id: 'key', name: '客服后端' } }
      ].map((row, i) => ({ ...base, ...row, _id: `row-${i}`, chatId: `chat-${i}` }))
    );
    await render();
    const column = [...container.querySelectorAll('thead th')].findIndex(
      (cell) => cell.textContent === 'app:logs_keys_source'
    );
    expect(column).toBeGreaterThanOrEqual(0);
    expect(
      [...container.querySelectorAll('tbody tr')].map(
        (row) => row.querySelectorAll('td')[column]?.textContent
      )
    ).toEqual(['-', '-', '-', '-', '-', '客服后端']);
  });
  it('defaults to user only; toggles authorizer, persists and exports selected columns', async () => {
    await render();
    expect(container.querySelector('thead')?.textContent).toContain('app:logs_keys_user');
    expect(container.querySelector('thead')?.textContent).not.toContain('app:logs_keys_auth_user');
    expect(container.querySelector('tbody')?.textContent).toContain('customer-42');
    expect(container.querySelector('tbody')?.textContent).not.toContain('Member A');
    await click(authorizerToggle());
    expect(container.querySelector('thead')?.textContent).toContain('app:logs_keys_auth_user');
    expect(container.querySelector('tbody')?.textContent).toContain('Member A');
    await click(
      [...container.querySelectorAll('button')].find(
        (button) => button.textContent === 'confirm-export'
      )
    );
    expect(downloadFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ logKeys: expect.arrayContaining(['user', 'authUser']) })
      })
    );
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(container.querySelector('thead')?.textContent).toContain('app:logs_keys_auth_user');
  });
  it.each(['active', 'leave'])('shows a resolved share visitor with status %s', async (status) => {
    const visitorId = '68ad85a7463006c963799a05';
    getLogRows.mockReturnValue([
      {
        ...getLogRows()[0],
        source: 'share',
        outLinkUid: visitorId,
        sourceMember: { name: 'Share Visitor', avatar: '/share-visitor.svg', status }
      }
    ]);
    await render();
    const body = container.querySelector('tbody');
    expect(body?.textContent).toContain('Share Visitor');
    expect(body?.textContent).not.toContain(visitorId);
    expect(body?.textContent).not.toContain('Member A');
    expect(body?.querySelector('img')?.getAttribute('src')).toBe('/share-visitor.svg');
    expect(body?.textContent?.includes('common:user_leaved')).toBe(status === 'leave');

    await click(authorizerToggle());
    expect(container.querySelector('thead')?.textContent).toContain('app:logs_keys_auth_user');
    expect(container.querySelector('tbody')?.textContent).toContain('Member A');
    expect(container.querySelector('tbody')?.textContent).toContain('Share Visitor');
  });
  it('adds authorizer disabled to old local settings without re-enabling hidden user', async () => {
    localStorage.setItem(
      'app_log_keys_app-1',
      JSON.stringify([
        { key: 'title', enable: true },
        { key: 'user', enable: false }
      ])
    );
    await render();
    expect(container.querySelector('thead')?.textContent).not.toContain('app:logs_keys_user');
    expect(container.querySelector('thead')?.textContent).not.toContain('app:logs_keys_auth_user');
    expect(authorizerToggle()).toBeDefined();
  });
  it('uses normalized team settings on a fresh browser', async () => {
    vi.mocked(getLogKeys).mockResolvedValue({
      logKeys: [
        { key: 'authUser' as any, enable: true },
        { key: 'user' as any, enable: false }
      ]
    });
    await render();
    expect(container.querySelector('thead')?.textContent).toContain('app:logs_keys_auth_user');
    expect(container.querySelector('thead')?.textContent).not.toContain('app:logs_keys_user');
  });
  it('normalizes columns when syncing team settings and saving personal settings to the team', async () => {
    localStorage.setItem('app_log_keys_app-1', JSON.stringify([{ key: 'user', enable: true }]));
    vi.mocked(getLogKeys).mockResolvedValue({
      logKeys: [
        { key: 'authUser' as any, enable: true },
        { key: 'user' as any, enable: false }
      ]
    });
    await render();
    await click(
      [...container.querySelectorAll('button')].find(
        (button) => button.textContent === 'app:sync_team_app_log_keys'
      )
    );
    expect(container.querySelector('thead')?.textContent).toContain('app:logs_keys_auth_user');
    expect(container.querySelector('thead')?.textContent).not.toContain('app:logs_keys_user');

    await click(
      [...container.querySelectorAll('button[aria-label="visible"]')].find((button) =>
        button.parentElement?.textContent?.includes('app:logs_keys_auth_user')
      )
    );
    await click(
      [...container.querySelectorAll('button')].find(
        (button) => button.textContent === 'app:save_team_app_log_keys'
      )
    );
    expect(updateLogKeys).toHaveBeenCalledWith({
      appId: 'app-1',
      logKeys: expect.arrayContaining([
        { key: 'user', enable: false },
        { key: 'authUser', enable: false }
      ])
    });
  });
  it('shows search failure and retries the first page without an end marker', async () => {
    vi.mocked(searchAppChatLogs)
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce({ list: [], nextCursor: undefined });
    await render({ cursorSearch: true });
    await setSearch();

    expect(container.textContent).toContain('common:load_failed');
    expect(container.textContent).not.toContain('common:request_end');
    expect(searchAppChatLogs).toHaveBeenCalledTimes(1);

    await click(
      [...container.querySelectorAll('button')].find(
        (button) => button.textContent === 'common:refresh'
      )
    );
    expect(searchAppChatLogs).toHaveBeenCalledTimes(2);
    expect(vi.mocked(searchAppChatLogs).mock.calls[1][0].cursor).toBeUndefined();
    expect(container.textContent).toContain('common:request_end');
  });
  it('uses the export confirmation without total in search mode', async () => {
    await render({ cursorSearch: true });
    await setSearch();
    expect(container.querySelector('[data-testid="export-confirm-content"]')?.textContent).toBe(
      'app:logs_export_confirm_tip_without_total'
    );
  });
  it('keeps the total in the export confirmation on paginated logs', async () => {
    await render();
    expect(container.querySelector('[data-testid="export-confirm-content"]')?.textContent).toBe(
      'app:logs_export_confirm_tip'
    );
    expect(translate).toHaveBeenCalledWith('app:logs_export_confirm_tip', { total: 1 });
  });
  it('connects pagination to the actual table body scroll container', async () => {
    await render();
    const scrollContainerRef = getPaginationOptions.mock.calls.at(-1)?.[0].scrollContainerRef as {
      current: HTMLDivElement | null;
    };
    const tableBody = container.querySelector('table')?.parentElement;
    expect(scrollContainerRef.current).toBeTruthy();
    expect(scrollContainerRef.current).toBe(tableBody);
  });
});
