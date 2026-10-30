import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getLogs: vi.fn(),
  download: vi.fn(),
  date: {} as Record<string, any>,
  member: {} as Record<string, any>,
  event: {} as Record<string, any>,
  total: 326
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('next/router', () => ({ useRouter: () => ({ query: { page: '3' } }) }));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: false }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));
vi.mock('@/web/support/user/team/operantionLog/api', () => ({ getOperationLogs: mocks.getLogs }));
vi.mock('@/web/common/system/utils', () => ({ downloadFetch: mocks.download }));
vi.mock('@fastgpt/web/components/common/DateRangePicker', () => ({
  default: (props: Record<string, any>) => {
    mocks.date = props;
    return null;
  }
}));
vi.mock('@/components/support/user/TeamMemberFilter', () => ({
  default: (props: Record<string, any>) => {
    mocks.member = props;
    return null;
  }
}));
vi.mock('@fastgpt/web/components/common/TagFilter', async () => ({
  ...(await vi.importActual('@fastgpt/web/components/common/TagFilter/multiSelectFilterUtils')),
  MultiSelectFilter: (props: Record<string, any>) => {
    mocks.event = props;
    return null;
  },
  useCommonFilterLabels: () => ({})
}));
vi.mock('@fastgpt/web/components/common/MyMenu', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/UserBox', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/EmptyTip', () => ({
  default: ({ text }: { text: React.ReactNode }) => text
}));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('@fastgpt/web/components/common/MyBox', () => ({
  default: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children)
}));
vi.mock('@fastgpt/web/components/common/FixedTable', () => ({
  FixedTableContainer: React.forwardRef<
    HTMLDivElement,
    React.PropsWithChildren<{ footer?: React.ReactNode }>
  >(function MockFixedTable({ children, footer }, ref) {
    return React.createElement('div', { ref }, children, footer);
  })
}));
vi.mock('ahooks', async () => {
  const actual = await vi.importActual<typeof import('ahooks')>('ahooks');
  return {
    ...actual,
    useRequest: (service: () => Promise<unknown>, options: Record<string, any> = {}) => {
      const key = JSON.stringify(options.refreshDeps ?? []);
      const run = actual.useMemoizedFn(service);
      React.useEffect(() => {
        if (options.manual === false) void run();
      }, [options.manual, key, run]);
      return { run, runAsync: run, loading: false };
    }
  };
});
vi.mock('@chakra-ui/react', () => {
  const container = (tag: string) =>
    React.forwardRef<HTMLElement, React.PropsWithChildren<Record<string, any>>>(
      function MockContainer({ children, onClick, colSpan }, ref) {
        return React.createElement(tag, { ref, onClick, colSpan }, children);
      }
    );
  return {
    Box: container('div'),
    Flex: container('div'),
    Table: container('table'),
    Tbody: container('tbody'),
    Td: container('td'),
    Th: container('th'),
    Thead: container('thead'),
    Tr: container('tr'),
    Button: ({ children, onClick, isDisabled }: React.PropsWithChildren<Record<string, any>>) =>
      React.createElement('button', { onClick, disabled: isDisabled }, children)
  };
});

import Audit from '@/pageComponents/account/team/Audit';

let host: HTMLDivElement;
let root: Root;
const render = async (key = 'team-a') => {
  await act(async () => root.render(React.createElement(Audit, { Tabs: null, key })));
};
const exportButton = () =>
  Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === 'common:Export'
  )!;

describe('audit filters and export interactions', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost',
      pretendToBeVisual: true
    });
    vi.stubGlobal('React', React);
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    mocks.total = 326;
    mocks.getLogs.mockReset().mockImplementation(async () => ({ total: mocks.total, list: [] }));
    mocks.download.mockReset().mockResolvedValue(undefined);
    window.localStorage.setItem('fastgpt:pagination:page-size:account-team-audit', '50');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    window.localStorage.clear();
    window.close();
    vi.unstubAllGlobals();
  });

  it('resets to page one on confirmed filters, retains page size and exports every match without pagination', async () => {
    await render();
    expect(mocks.getLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNum: 3, pageSize: 50 })
    );
    expect(mocks.member.activeOnly).toBe(false);
    expect(mocks.date.historyLimitDays).toBe(null);
    await act(async () =>
      mocks.date.onSuccess({
        from: new Date(2020, 0, 1),
        to: new Date(2020, 0, 2, 23, 59, 59, 999)
      })
    );
    await act(async () => mocks.member.onChange({ mode: 'selected', values: ['member-a'] }));
    await act(async () => mocks.event.onChange({ mode: 'selected', values: ['LOGIN'] }));
    expect(mocks.getLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNum: 1, pageSize: 50, tmbIds: ['member-a'], events: ['LOGIN'] })
    );
    await act(async () => exportButton().click());
    const downloadBody = mocks.download.mock.calls[0][0].body;
    expect(downloadBody).toMatchObject({
      dateStart: expect.stringContaining('2020-01-01'),
      dateEnd: expect.stringContaining('2020-01-02'),
      tmbIds: ['member-a'],
      events: ['LOGIN'],
      timezone: expect.any(String),
      locale: 'en'
    });
    expect(downloadBody).not.toHaveProperty('pageNum');
    expect(downloadBody).not.toHaveProperty('pageSize');
    expect(mocks.getLogs.mock.lastCall![0]).toHaveProperty('timezone');
  });

  it('resets only the time range and clears old selections when switching teams', async () => {
    mocks.total = 0;
    await render();
    await act(async () => mocks.member.onChange({ mode: 'selected', values: ['old-member'] }));
    await act(async () => mocks.event.onChange({ mode: 'selected', values: ['LOGIN'] }));
    await act(async () =>
      mocks.date.onSuccess({ from: new Date(2020, 0, 1), to: new Date(2020, 0, 2) })
    );
    expect(exportButton().disabled).toBe(true);
    const reset = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'account_team:audit_reset_time'
    )!;
    await act(async () => reset.click());
    expect(mocks.getLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ tmbIds: ['old-member'], events: ['LOGIN'] })
    );
    expect(new Date(mocks.getLogs.mock.lastCall![0].dateStart).getFullYear()).toBe(
      new Date().getFullYear()
    );
    await render('team-b');
    expect(mocks.getLogs.mock.lastCall![0].tmbIds).toBeUndefined();
  });

  it('blocks duplicate exports while a download is pending', async () => {
    let finish!: () => void;
    mocks.download.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    await render();
    await act(async () => {
      exportButton().click();
      exportButton().click();
    });
    expect(mocks.download).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await act(async () => exportButton().click());
    expect(mocks.download).toHaveBeenCalledTimes(2);
    await act(async () => finish());
  });
});
