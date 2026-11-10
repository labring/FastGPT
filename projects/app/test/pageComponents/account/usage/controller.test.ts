import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useUsageFilterController,
  type UsageFilterController
} from '@/pageComponents/account/usage/useUsageFilterController';
import type {
  UsageFilterContext,
  UsageSubjectFilter
} from '@fastgpt/global/support/wallet/usage/filter';
import type {
  GetUsageBodyType,
  GetUsageDashboardBodyType,
  UsageFilterOptionsBody,
  UsageFilterOptionsResponse
} from '@fastgpt/global/openapi/support/wallet/usage/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';

const mocks = vi.hoisted(() => ({
  getUserUsages: vi.fn(),
  getDashboardData: vi.fn(),
  options: vi.fn(),
  downloadFetch: vi.fn(),
  toast: vi.fn(),
  t: (key: string) => key
}));
vi.mock('@/web/support/wallet/usage/api', () => ({
  getUserUsages: mocks.getUserUsages,
  getDashboardData: mocks.getDashboardData,
  getUsageFilterOptions: mocks.options
}));
vi.mock('@/web/common/system/utils', () => ({ downloadFetch: mocks.downloadFetch }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: mocks.t })
}));

const team = '100000000000000000000001',
  a = '200000000000000000000001',
  b = '200000000000000000000002';
const filters = {
  dateRange: { from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-11-03T00:00:00Z') },
  sourceFilter: { mode: 'all' as const, values: [] },
  projectName: 'App',
  unit: 'day' as const
};
const mapping = { appNameMap: {}, sourcesMap: {}, title: 'Time,Member' };

const contextFor = (
  subjectFilter: UsageSubjectFilter = { type: 'member', ids: [] },
  manage = true
): UsageFilterContext => ({
  canManageMembers: manage,
  scope: manage ? 'team' : 'self',
  subjectFilter: manage ? subjectFilter : { type: 'member', ids: [] },
  selectedItems: !manage
    ? []
    : subjectFilter.ids.map((id) => ({ id, name: id, status: TeamMemberStatusEnum.active })),
  notices: [],
  selectionChanged: false,
  scopeChanged: false,
  resetPagination: false
});

const optionsFor = (body: UsageFilterOptionsBody, manage = true): UsageFilterOptionsResponse => ({
  context: contextFor(body.subjectFilter, manage),
  options: [],
  total: 0,
  hasMore: false,
  breadcrumbs: []
});

describe('useUsageFilterController', () => {
  let dom: JSDOM, root: Root, controller: UsageFilterController;
  const ChildObserver = ({ ctrl }: { ctrl: UsageFilterController }) => {
    const { fetchDashboard, queryKey } = ctrl;
    React.useEffect(() => {
      void fetchDashboard();
    }, [fetchDashboard, queryKey]);
    return null;
  };
  const Harness = (props: {
    teamId?: string;
    canManage?: boolean;
    filters?: typeof filters;
    withChild?: boolean;
  }) => {
    controller = useUsageFilterController({
      teamId: props.teamId ?? team,
      canManage: props.canManage ?? true,
      filters: props.filters ?? filters
    });
    return props.withChild ? React.createElement(ChildObserver, { ctrl: controller }) : null;
  };
  const flush = () =>
    act(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
  const render = async (props: React.ComponentProps<typeof Harness> = {}) => {
    await act(async () => root.render(React.createElement(Harness, props)));
    await flush();
  };

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><div id="host"></div>', { url: 'http://localhost' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.getUserUsages.mockReset().mockImplementation(async (body: GetUsageBodyType) => ({
      list: [],
      total: 10,
      context: contextFor(body.subjectFilter)
    }));
    mocks.getDashboardData
      .mockReset()
      .mockImplementation(async (body: GetUsageDashboardBodyType) => ({
        list: [],
        context: contextFor(body.subjectFilter)
      }));
    mocks.options
      .mockReset()
      .mockImplementation(async (body: UsageFilterOptionsBody) => optionsFor(body));
    mocks.downloadFetch.mockReset().mockResolvedValue(undefined);
    mocks.toast.mockReset();
    root = createRoot(document.getElementById('host')!);
    await render();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('updates selection, resets on team change before child effects, and ignores clicking the active type', async () => {
    await render({ withChild: true });
    await act(async () =>
      controller.toggleItem({ id: a, name: 'Member A', status: TeamMemberStatusEnum.active })
    );
    expect(controller.subjectFilter).toEqual({ type: 'member', ids: [a] });

    mocks.options.mockClear();
    await act(async () => controller.changeType('member'));
    expect(mocks.options).not.toHaveBeenCalled();

    mocks.getDashboardData.mockClear();
    await render({ teamId: b, withChild: true });
    expect(controller.subjectFilter).toEqual({ type: 'member', ids: [] });
    expect(mocks.getDashboardData).toHaveBeenCalledTimes(1);
    expect(mocks.getDashboardData).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectFilter: { type: 'member', ids: [] },
        expectedScope: 'team'
      })
    );
  });

  it('clears selection while keeping the active subject type and resetting department directory', async () => {
    await act(async () => controller.changeType('department'));
    const selected: UsageSubjectFilter = {
      type: 'department',
      ids: [a]
    };
    mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => ({
      ...optionsFor(body),
      options: [
        {
          id: body.departmentDirectoryId ? a : b,
          name: body.departmentDirectoryId ? 'Sub Dept' : 'Root Dept',
          status: TeamMemberStatusEnum.active
        }
      ]
    }));
    await act(async () => controller.open());
    await act(async () => controller.navigate(a));
    await act(async () => controller.searchOptions('sub'));
    await act(async () =>
      controller.toggleItem({ id: a, name: 'Sub Dept', status: TeamMemberStatusEnum.active })
    );
    await flush();
    expect(controller.subjectFilter).toEqual(selected);
    expect(controller.context?.selectedItems).toMatchObject([{ id: a, name: 'Sub Dept' }]);

    await act(async () => controller.clear());
    expect(controller.subjectFilter).toEqual({ type: 'department', ids: [] });
    expect(controller.context?.selectedItems).toEqual([]);
    expect(controller.directoryId).toBe('');
    expect(controller.search).toBe('');
    await flush();
    expect(controller.options.map((item) => item.id)).toEqual([b]);
  });

  it('ignores stale options, usage and export responses after selection, type, permission, team or date changes', async () => {
    const deferred = <T>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    };
    const pendingUsagesResponse = deferred<unknown>();
    mocks.getUserUsages.mockImplementationOnce(() => pendingUsagesResponse.promise);
    const pendingUsages = controller.fetchUsages({ ...controller.requestParams, pageNum: 1 });
    await act(async () =>
      controller.toggleItem({ id: a, name: 'Member A', status: TeamMemberStatusEnum.active })
    );
    await act(async () => {
      pendingUsagesResponse.resolve({
        list: [],
        total: 1,
        context: contextFor({ type: 'member', ids: [] })
      });
      await pendingUsages;
    });
    expect(controller.subjectFilter).toEqual({ type: 'member', ids: [a] });

    await act(async () => controller.changeType('department'));
    await act(async () => controller.open());
    await flush();

    const deptResponse = optionsFor({
      intent: 'options',
      subjectFilter: { type: 'department', ids: [a] },
      expectedScope: 'team'
    });
    const pendingBrowse = deferred<UsageFilterOptionsResponse>();
    mocks.options.mockImplementationOnce(() => pendingBrowse.promise);
    await act(async () => controller.navigate(a));
    mocks.options.mockImplementationOnce(async (body: UsageFilterOptionsBody) => ({
      ...optionsFor(body),
      options: [{ id: b, name: 'Group B', status: TeamMemberStatusEnum.active }]
    }));
    await act(async () => controller.changeType('group'));
    await flush();
    await act(async () => pendingBrowse.resolve(deptResponse));
    await flush();
    expect(controller.subjectFilter).toEqual({ type: 'group', ids: [] });
    expect(controller.options.map((item) => item.id)).toEqual([b]);

    await act(async () => controller.changeType('department'));
    await flush();
    const pendingPermBrowse = deferred<UsageFilterOptionsResponse>();
    mocks.options.mockImplementationOnce(() => pendingPermBrowse.promise);
    await act(async () => controller.navigate(a));
    await render({ canManage: false });
    await act(async () => pendingPermBrowse.resolve(deptResponse));
    await flush();
    expect(controller.canManageMembers).toBe(false);
    expect(controller.subjectFilter).toEqual({ type: 'member', ids: [] });

    await render({ canManage: true });
    const pendingValidate = deferred<UsageFilterOptionsResponse>();
    mocks.options.mockImplementationOnce(() => pendingValidate.promise);
    let pendingExport!: Promise<void>;
    await act(async () => {
      pendingExport = controller.exportUsage(mapping);
    });
    await flush();
    await render({
      filters: {
        ...filters,
        dateRange: { from: new Date('2026-11-02T00:00:00Z'), to: new Date('2026-11-04T00:00:00Z') }
      }
    });
    await act(async () => {
      pendingValidate.resolve(
        optionsFor({
          intent: 'validate',
          subjectFilter: { type: 'member', ids: [] },
          expectedScope: 'team'
        })
      );
      await pendingExport;
    });
    expect(mocks.downloadFetch).not.toHaveBeenCalled();
  });

  it('consumes paired dashboard data and context from a single request without separate validation races', async () => {
    await act(async () => controller.changeType('group'));
    await act(async () =>
      controller.toggleItem({ id: a, name: 'Group A', status: TeamMemberStatusEnum.active })
    );
    expect(controller.subjectFilter).toEqual({ type: 'group', ids: [a] });
    const groupQueryKey = controller.queryKey;

    mocks.options.mockClear();
    mocks.getDashboardData.mockResolvedValueOnce({
      list: [{ date: new Date('2026-11-01T00:00:00Z'), totalPoints: 20 }],
      context: {
        ...contextFor({ type: 'group', ids: [] }),
        notices: ['GROUP_INVALID'],
        selectionChanged: true,
        resetPagination: true
      }
    });

    let points: Awaited<ReturnType<typeof controller.fetchDashboard>> = [];
    await act(async () => {
      points = await controller.fetchDashboard();
    });
    expect(mocks.options).not.toHaveBeenCalled();
    expect(points).toEqual([{ date: '2026-11-01', totalPoints: 20 }]);
    expect(controller.subjectFilter).toEqual({ type: 'group', ids: [] });
    expect(controller.queryKey).not.toBe(groupQueryKey);
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'warning',
      title: 'account_usage:group_invalid'
    });

    await act(async () => controller.changeType('department'));
    expect(controller.subjectFilter).toEqual({ type: 'department', ids: [] });
    mocks.getDashboardData.mockResolvedValueOnce({
      list: [{ date: new Date('2026-11-01T00:00:00Z'), totalPoints: 10 }],
      context: {
        ...contextFor({ type: 'department', ids: [] }, false),
        notices: ['PERMISSION_CHANGED'],
        scopeChanged: true,
        resetPagination: true
      }
    });
    await act(async () => {
      points = await controller.fetchDashboard();
    });
    expect(points).toEqual([{ date: '2026-11-01', totalPoints: 10 }]);
    expect(controller.canManageMembers).toBe(false);
    expect(controller.subjectFilter).toEqual({ type: 'member', ids: [] });
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'warning',
      title: 'account_usage:permission_changed'
    });
  });

  it('invalidates self context and refreshes team scope when canManage elevates from false to true', async () => {
    await render({ canManage: false });
    mocks.getUserUsages.mockImplementationOnce(async (body: GetUsageBodyType) => ({
      list: [],
      total: 1,
      context: contextFor(body.subjectFilter, false)
    }));
    await act(async () => {
      await controller.fetchUsages({ ...controller.requestParams, pageNum: 1 });
    });
    expect(controller.canManageMembers).toBe(false);
    expect(controller.requestParams.expectedScope).toBe('self');
    const selfQueryKey = controller.queryKey;

    let resolveLateSelf!: (value: unknown) => void;
    mocks.getUserUsages.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLateSelf = resolve;
        })
    );
    const pendingSelf = controller.fetchUsages({ ...controller.requestParams, pageNum: 1 });

    mocks.options.mockClear();
    await render({ canManage: true });
    expect(controller.canManageMembers).toBe(true);
    expect(controller.context).toBeUndefined();
    expect(controller.requestParams.expectedScope).toBe('team');
    expect(controller.queryKey).not.toBe(selfQueryKey);

    await act(async () => {
      resolveLateSelf({
        list: [],
        total: 1,
        context: contextFor({ type: 'member', ids: [] }, false)
      });
      await pendingSelf;
    });
    expect(controller.canManageMembers).toBe(true);
    expect(controller.requestParams.expectedScope).toBe('team');

    await act(async () => controller.open());
    await flush();
    expect(controller.isOpen).toBe(true);
    expect(mocks.options).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'options',
        expectedScope: 'team'
      }),
      expect.anything()
    );
  });

  it('browses, searches, navigates, appends options, and handles ORG_PATH_RESET in a single options call', async () => {
    mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => ({
      ...optionsFor(body),
      options: [{ id: a, name: 'Option A', status: TeamMemberStatusEnum.active }],
      total: 2,
      hasMore: body.intent === 'options' && (body.pagination?.offset ?? 0) === 0
    }));
    await act(async () => controller.open());
    await flush();
    expect(controller.options).toHaveLength(1);

    await act(async () => controller.loadMore());
    await flush();
    expect(controller.options).toHaveLength(2);

    await act(async () => controller.changeType('department'));
    await flush();
    mocks.options.mockImplementationOnce(async (body: UsageFilterOptionsBody) => ({
      ...optionsFor(body),
      context: {
        ...contextFor(body.subjectFilter),
        subjectFilter: { type: 'department', ids: [] },
        notices: ['ORG_PATH_RESET'],
        selectionChanged: true,
        resetPagination: true
      },
      options: [{ id: b, name: 'Root Dept', status: TeamMemberStatusEnum.active }],
      total: 1,
      hasMore: false
    }));
    await act(async () => controller.navigate(a));
    await flush();

    expect(controller.directoryId).toBe('');
    expect(controller.options.map((item) => item.id)).toEqual([b]);
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'warning',
      title: 'account_usage:organization_updated'
    });
  });

  it('closes options and blocks management when permission is lost', async () => {
    await act(async () => controller.open());
    await flush();
    expect(controller.isOpen).toBe(true);

    mocks.options.mockImplementationOnce(async (body: UsageFilterOptionsBody) => ({
      ...optionsFor(body, false),
      context: {
        ...contextFor(body.subjectFilter, false),
        notices: ['PERMISSION_CHANGED'],
        scopeChanged: true,
        resetPagination: true
      }
    }));

    await act(async () => controller.searchOptions('x'));
    await flush();

    expect(controller.canManageMembers).toBe(false);
    expect(controller.isOpen).toBe(false);
    expect(controller.options).toEqual([]);
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'warning',
      title: 'account_usage:permission_changed'
    });
  });

  it('toggles parent and child departments independently without options RPCs and syncs invalid departments on query', async () => {
    await act(async () => controller.changeType('department'));
    await act(async () => controller.open());
    await flush();
    mocks.options.mockClear();

    await act(async () => {
      controller.toggleItem({
        id: a,
        name: 'Parent Dept',
        status: TeamMemberStatusEnum.active,
        hasChildren: true
      });
    });
    await act(async () => {
      controller.toggleItem({
        id: b,
        name: 'Child Dept',
        status: TeamMemberStatusEnum.active,
        hasChildren: false
      });
    });
    expect(mocks.options).not.toHaveBeenCalled();
    expect(controller.subjectFilter).toEqual({ type: 'department', ids: [a, b] });
    expect(controller.context?.selectedItems.map((item) => item.name)).toEqual([
      'Parent Dept',
      'Child Dept'
    ]);

    await act(async () => {
      controller.toggleItem({
        id: b,
        name: 'Child Dept',
        status: TeamMemberStatusEnum.active
      });
    });
    expect(controller.subjectFilter).toEqual({ type: 'department', ids: [a] });

    const validFilter: UsageSubjectFilter = { type: 'department', ids: [a] };
    mocks.getDashboardData.mockResolvedValueOnce({
      list: [{ date: new Date('2026-11-01T00:00:00Z'), totalPoints: 12 }],
      context: {
        ...contextFor(validFilter),
        notices: ['DEPARTMENT_INVALID'],
        selectionChanged: true,
        resetPagination: true
      }
    });
    await act(async () => {
      await controller.fetchDashboard();
    });

    expect(controller.subjectFilter).toEqual(validFilter);
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'warning',
      title: 'account_usage:department_invalid'
    });
  });

  it('stops export when pre-validation detects a scope or filter change', async () => {
    mocks.options.mockImplementationOnce(async (body: UsageFilterOptionsBody) => ({
      ...optionsFor(body),
      context: {
        ...contextFor(body.subjectFilter),
        notices: ['GROUP_INVALID'],
        selectionChanged: true,
        resetPagination: true
      }
    }));
    await act(async () => controller.exportUsage(mapping));
    await flush();
    expect(mocks.downloadFetch).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'warning',
      title: 'account_usage:group_invalid'
    });
  });

  it('keeps ordinary member export active across stable self responses and surfaces download errors', async () => {
    await render({ canManage: false });

    let resolveDashboard!: (value: unknown) => void;
    let resolveValidate!: (value: UsageFilterOptionsResponse) => void;
    mocks.getDashboardData.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDashboard = resolve;
        })
    );
    mocks.options.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveValidate = resolve;
        })
    );

    const pendingDashboard = controller.fetchDashboard();
    let pendingExport!: Promise<void>;
    await act(async () => {
      pendingExport = controller.exportUsage(mapping);
    });

    await act(async () => {
      resolveDashboard({
        list: [{ date: new Date('2026-11-01T00:00:00Z'), totalPoints: 3 }],
        context: contextFor({ type: 'member', ids: [] }, false)
      });
      await pendingDashboard;
    });

    await act(async () => {
      resolveValidate(
        optionsFor(
          {
            intent: 'validate',
            subjectFilter: { type: 'member', ids: [] },
            expectedScope: 'self'
          },
          false
        )
      );
      await pendingExport;
    });

    expect(mocks.downloadFetch).toHaveBeenCalledTimes(1);
    expect(mocks.downloadFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          subjectFilter: { type: 'member', ids: [] },
          expectedScope: 'self'
        })
      })
    );

    mocks.options.mockImplementationOnce(async (body: UsageFilterOptionsBody) =>
      optionsFor(body, false)
    );
    mocks.downloadFetch.mockRejectedValueOnce(new Error('CSV stream broken'));
    await act(async () => {
      await controller.exportUsage(mapping);
    });

    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'error',
      title: 'CSV stream broken'
    });
  });
});
