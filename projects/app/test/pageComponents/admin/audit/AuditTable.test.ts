import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MultiSelectFilterProps } from '@fastgpt/web/components/common/TagFilter/MultiSelectFilter';

const mocks = vi.hoisted(() => ({
  getTeamMembers: vi.fn(),
  auditParams: {} as { tmbIds?: string[] }
}));

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/web/support/user/team/api', () => ({ getTeamMembers: mocks.getTeamMembers }));
vi.mock('@/web/support/user/useUserStore', () => ({ useUserStore: () => ({}) }));
vi.mock('@/web/admin/system/audit/api', () => ({ getOperationLogs: vi.fn() }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@fastgpt/web/hooks/usePagination', () => ({
  usePagination: (_api: unknown, options: { params: typeof mocks.auditParams }) => {
    mocks.auditParams = options.params;
    return { data: [], isLoading: false, Pagination: () => null, total: 0, pageSize: 20 };
  }
}));

// 保留真实成员筛选器、滚动分页 hook 和请求；只将样式组件替换为可交互的 DOM。
vi.mock('@chakra-ui/react', () => {
  const Box = React.forwardRef<
    HTMLDivElement,
    React.PropsWithChildren<{
      onClick?: React.MouseEventHandler<HTMLDivElement>;
      'data-testid'?: string;
    }>
  >(function Box({ children, onClick, ...props }, ref) {
    return React.createElement(
      'div',
      { ref, onClick, 'data-testid': props['data-testid'] },
      children
    );
  });
  return Object.fromEntries(
    ['Box', 'Flex', 'Table', 'Thead', 'Tbody', 'Tr', 'Th', 'Td', 'FormLabel'].map((name) => [
      name,
      Box
    ])
  );
});
vi.mock('@fastgpt/web/components/common/MyBox', async () => {
  const { Box } = await import('@chakra-ui/react');
  return { default: Box };
});
vi.mock('@fastgpt/web/components/common/FixedTable', async () => {
  const { Box } = await import('@chakra-ui/react');
  return { FixedTableContainer: Box };
});
vi.mock('@/components/admin/BoxContainer/PageRoot', async () => {
  const { Box } = await import('@chakra-ui/react');
  return { default: Box };
});
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/UserBox', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({ default: () => null }));
vi.mock('@/pageComponents/admin/audit/processors', () => ({ specialProcessors: {} }));
vi.mock('@/pageComponents/admin/audit/commonProcessor', () => ({
  defaultMetadataProcessor: vi.fn()
}));
vi.mock('@fastgpt/web/components/common/TagFilter', async () => {
  const utils = await import('@fastgpt/web/components/common/TagFilter/multiSelectFilterUtils');
  return {
    ...utils,
    useCommonFilterLabels: () => ({ all: '全部' }),
    MultiSelectFilter: ({
      title,
      value,
      onChange,
      options,
      searchValue,
      onSearchChange,
      onOpen,
      ListContainer
    }: MultiSelectFilterProps) =>
      React.createElement(
        'section',
        { 'data-filter': title },
        React.createElement('button', {
          type: 'button',
          'data-open': title,
          onClick: () => onOpen?.()
        }),
        React.createElement('input', {
          'aria-label': title as string,
          value: searchValue ?? '',
          onInput: (event: React.FormEvent<HTMLInputElement>) =>
            onSearchChange?.(event.currentTarget.value),
          readOnly: !onSearchChange
        }),
        React.createElement(
          ListContainer ?? 'div',
          { 'data-testid': `${title}-members` },
          options.map((option) =>
            React.createElement(
              'button',
              {
                key: option.value,
                'data-member': option.value,
                'aria-pressed': value.values.includes(option.value),
                onClick: () => onChange(utils.toggleMultiSelectFilterValue(value, option.value))
              },
              option.label
            )
          )
        )
      )
  };
});

const members = Array.from({ length: 30 }, (_, index) => ({
  tmbId: `member-${index + 1}`,
  memberName: `成员${index + 1}`,
  avatar: '',
  status: index < 20 ? 'active' : index === 29 ? 'leave' : 'forbidden'
}));

describe('AuditTable member pagination', () => {
  let dom: JSDOM;
  let root: Root;
  let host: HTMLDivElement;
  let AuditTable: typeof import('@/pageComponents/admin/audit/AuditTable').default;
  let TeamMemberFilter: typeof import('@/components/support/user/TeamMemberFilter').default;

  beforeEach(async () => {
    // App 全局 setup 需要服务端环境；完成后再安装 DOM，并加载依赖浏览器环境的 hooks。
    dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('React', React);
    vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
    vi.stubGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
    mocks.getTeamMembers.mockReset().mockImplementation(async (params) => {
      const filtered = members.filter(
        (member) =>
          (!params.status || member.status === params.status) &&
          (!params.tmbIds || params.tmbIds.includes(member.tmbId)) &&
          (!params.searchKey || member.memberName.includes(params.searchKey))
      );
      return {
        list: filtered.slice(params.offset, params.offset + params.pageSize),
        total: filtered.length
      };
    });
    AuditTable = (await import('@/pageComponents/admin/audit/AuditTable')).default;
    TeamMemberFilter = (await import('@/components/support/user/TeamMemberFilter')).default;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    dom.window.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** 等待搜索防抖、滚动节流及其异步请求完成。 */
  const settleRequests = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });
  };

  const openFilter = async (title: string) => {
    await act(async () => {
      host.querySelector<HTMLButtonElement>(`[data-open="${title}"]`)!.click();
    });
    await settleRequests();
  };

  it('loads and selects members beyond the first page after opening, without fetching on mount', async () => {
    await act(async () => root.render(React.createElement(AuditTable)));
    await settleRequests();
    expect(mocks.getTeamMembers).not.toHaveBeenCalled();

    await openFilter('admin:operator');
    expect(
      host.querySelectorAll('[data-filter="admin:operator"] button[data-member]')
    ).toHaveLength(20);
    expect(mocks.getTeamMembers).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, pageSize: 20 }),
      expect.any(AbortController)
    );

    // 再次展开复用已加载列表，不重复触发首屏请求。
    const callsAfterFirstOpen = mocks.getTeamMembers.mock.calls.length;
    await openFilter('admin:operator');
    expect(mocks.getTeamMembers).toHaveBeenCalledTimes(callsAfterFirstOpen);

    const list = host.querySelector<HTMLDivElement>('[data-testid="admin:operator-members"]')!;
    await act(async () => {
      list.scrollTop = 800;
      list.dispatchEvent(new Event('scroll'));
    });
    await settleRequests();
    expect(mocks.getTeamMembers).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 20, pageSize: 20 }),
      expect.any(AbortController)
    );
    expect(
      host.querySelectorAll('[data-filter="admin:operator"] button[data-member]')
    ).toHaveLength(30);

    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-member="member-30"]')!.click()
    );
    await settleRequests();
    expect(mocks.auditParams.tmbIds).toEqual(['member-30']);
    expect(host.querySelector('[data-member="member-30"]')?.getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(mocks.getTeamMembers.mock.calls.every(([params]) => params.status === undefined)).toBe(
      true
    );
  });

  it('searches remotely and can select a member absent from the first page', async () => {
    await act(async () => root.render(React.createElement(AuditTable)));
    await openFilter('admin:operator');
    expect(host.querySelector('[data-member="member-30"]')).toBeNull();

    const input = host.querySelector<HTMLInputElement>('input[aria-label="admin:operator"]')!;
    await act(async () => {
      input.value = '成员30';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settleRequests();
    expect(mocks.getTeamMembers).toHaveBeenCalledWith(
      expect.objectContaining({ searchKey: '成员30', offset: 0, pageSize: 20 }),
      expect.any(AbortController)
    );
    expect(host.querySelector('[data-member="member-30"]')?.textContent).toBe('成员30');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-member="member-30"]')!.click()
    );
    await settleRequests();
    expect(mocks.auditParams.tmbIds).toEqual(['member-30']);
  });

  it('keeps the existing active-only default for other member filters after opening', async () => {
    await act(async () =>
      root.render(
        React.createElement(TeamMemberFilter, {
          title: '成员',
          value: { mode: 'all', values: [] },
          onChange: vi.fn()
        })
      )
    );
    await settleRequests();
    expect(mocks.getTeamMembers).not.toHaveBeenCalled();

    await openFilter('成员');
    expect(mocks.getTeamMembers).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
      expect.any(AbortController)
    );
  });

  it('retries loading when reopened after an initial load error', async () => {
    mocks.getTeamMembers.mockRejectedValueOnce(new Error('temporary error'));

    await act(async () =>
      root.render(
        React.createElement(TeamMemberFilter, {
          title: '成员',
          value: { mode: 'all', values: [] },
          onChange: vi.fn()
        })
      )
    );
    await openFilter('成员');
    expect(host.querySelectorAll('[data-filter="成员"] button[data-member]')).toHaveLength(0);

    await openFilter('成员');
    expect(host.querySelectorAll('[data-filter="成员"] button[data-member]')).toHaveLength(20);
  });

  it('requests the first page only once when opened immediately after mount', async () => {
    await act(async () =>
      root.render(
        React.createElement(TeamMemberFilter, {
          title: '成员',
          value: { mode: 'all', values: [] },
          onChange: vi.fn()
        })
      )
    );
    // 挂载后不等防抖计时器结束直接展开，完整推进节流（500ms）+ 防抖（200ms）窗口，确认不会触发两次首屏请求。
    await openFilter('成员');
    await settleRequests();
    expect(mocks.getTeamMembers.mock.calls.map(([params]) => params.offset)).toEqual([0]);
    expect(host.querySelectorAll('[data-filter="成员"] button[data-member]')).toHaveLength(20);
  });

  it('preserves loaded candidates when reopened after a load-more error', async () => {
    await act(async () => root.render(React.createElement(AuditTable)));
    await openFilter('admin:operator');
    expect(
      host.querySelectorAll('[data-filter="admin:operator"] button[data-member]')
    ).toHaveLength(20);

    mocks.getTeamMembers.mockRejectedValueOnce(new Error('load more failed'));
    const list = host.querySelector<HTMLDivElement>('[data-testid="admin:operator-members"]')!;
    await act(async () => {
      list.scrollTop = 800;
      list.dispatchEvent(new Event('scroll'));
    });
    await settleRequests();

    expect(mocks.getTeamMembers.mock.calls.map(([params]) => params.offset)).toEqual([0, 20]);

    // 续页失败后重新展开不应触发 offset=0 重置，已加载的第一页候选保持可见。
    await openFilter('admin:operator');
    expect(mocks.getTeamMembers.mock.calls.map(([params]) => params.offset)).toEqual([0, 20]);
    expect(
      host.querySelectorAll('[data-filter="admin:operator"] button[data-member]')
    ).toHaveLength(20);
  });
});
