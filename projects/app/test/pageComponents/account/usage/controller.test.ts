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
  UsageFilterOptionsBody,
  UsageFilterOptionsResponse,
  UsageQueryBody,
  UsageQueryResponse
} from '@fastgpt/global/openapi/support/wallet/usage/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  options: vi.fn(),
  download: vi.fn(),
  toast: vi.fn(),
  t: (key: string) => key
}));
vi.mock('@/web/support/wallet/usage/api', () => ({
  queryUsage: mocks.query,
  getUsageFilterOptions: mocks.options
}));
vi.mock('@/web/support/wallet/usage/download', () => ({ downloadUsage: mocks.download }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: mocks.t })
}));
vi.mock('@/web/common/api/request', () => ({ AUTH_ERROR_EVENT_NAME: 'test-auth-error' }));

const team = '100000000000000000000001',
  a = '200000000000000000000001',
  b = '200000000000000000000002',
  c = '200000000000000000000003';
const filters = {
  dateRange: { from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-11-03T00:00:00Z') },
  sourceFilter: { mode: 'all' as const, values: [] },
  projectName: 'App',
  unit: 'day' as const
};
const mapping = { appNameMap: {}, sourcesMap: {}, title: 'Time,Member' };
const contextFor = (
  body: Pick<UsageQueryBody, 'requestKey' | 'subjectFilter'>,
  manage = true
): UsageFilterContext => ({
  requestKey: body.requestKey,
  canManageMembers: manage,
  scope: manage ? 'team' : 'self',
  subjectFilter: manage ? body.subjectFilter : { type: 'member', ids: [] },
  selectedItems: !manage
    ? []
    : (body.subjectFilter.type === 'department'
        ? body.subjectFilter.rules.filter((item) => item.include).map((item) => item.orgId)
        : body.subjectFilter.ids
      ).map((id) => ({ id, name: id, status: TeamMemberStatusEnum.active })),
  notices: [],
  selectionChanged: false,
  scopeChanged: false,
  resetPagination: false
});
const responseFor = (body: UsageQueryBody, total = 10, manage = true): UsageQueryResponse =>
  body.view === 'detail'
    ? { view: body.view, data: { list: [], total }, context: contextFor(body, manage) }
    : { view: body.view, data: [], context: contextFor(body, manage) };
const optionsFor = (body: UsageFilterOptionsBody, manage = true): UsageFilterOptionsResponse => ({
  context: contextFor(body, manage),
  options: [],
  total: 0,
  hasMore: false,
  breadcrumbs: []
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

describe('usage page request arbitration', () => {
  let dom: JSDOM, root: Root, controller: UsageFilterController;
  const Harness = (props: {
    teamId?: string;
    canManage?: boolean;
    view?: 'detail' | 'dashboard';
    filters?: typeof filters;
  }) => {
    controller = useUsageFilterController({
      teamId: props.teamId ?? team,
      canManage: props.canManage ?? true,
      view: props.view ?? 'detail',
      filters: props.filters ?? filters
    });
    return null;
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
    mocks.query.mockReset().mockImplementation(async (body: UsageQueryBody) => responseFor(body));
    mocks.options
      .mockReset()
      .mockImplementation(async (body: UsageFilterOptionsBody) => optionsFor(body));
    mocks.download.mockReset().mockResolvedValue({ kind: 'downloaded' });
    mocks.toast.mockReset();
    root = createRoot(document.getElementById('host')!);
    await render();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('ignores old data and notices after changing subject type', async () => {
    const pending = deferred<UsageQueryResponse>();
    let oldBody!: UsageQueryBody;
    mocks.query.mockImplementation(async (body: UsageQueryBody) => {
      if (body.subjectFilter.type === 'member' && body.subjectFilter.ids.length) {
        oldBody = body;
        return pending.promise;
      }
      return responseFor(body, 20);
    });
    await act(async () =>
      controller.toggleItem({ id: a, name: 'A', status: TeamMemberStatusEnum.active })
    );
    await act(async () => controller.changeType('group'));
    await flush();
    expect(controller.subjectFilter).toEqual({ type: 'group', ids: [] });
    expect(controller.context?.selectedItems).toEqual([]);
    await act(async () =>
      pending.resolve({
        ...responseFor(oldBody, 999),
        context: { ...contextFor(oldBody), notices: ['GROUP_INVALID'] }
      })
    );
    expect(controller.result?.view === 'detail' && controller.result.data.total).toBe(20);
    expect(controller.subjectFilter.type).toBe('group');
    expect(controller.context?.selectedItems).toEqual([]);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it.each(['member', 'department', 'group'] as const)(
    'preserves %s selection and export scope when clicking the active type again',
    async (type) => {
      await act(async () => controller.changeType(type));
      await flush();
      const selected: UsageSubjectFilter =
        type === 'department' ? { type, rules: [{ orgId: a, include: true }] } : { type, ids: [a] };
      mocks.query.mockImplementation(async (body: UsageQueryBody) =>
        responseFor(body.departmentAction ? { ...body, subjectFilter: selected } : body, 100)
      );
      mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => ({
        ...optionsFor(body),
        options: [{ id: b, name: 'Candidate', status: TeamMemberStatusEnum.active }],
        total: 1
      }));
      await act(async () =>
        controller.toggleItem({ id: a, name: 'Selected', status: TeamMemberStatusEnum.active })
      );
      await flush();
      await act(async () => controller.changePage(2));
      await flush();
      await act(async () => controller.open());
      await flush();
      if (type === 'department') {
        await act(async () => controller.navigate(b));
        await flush();
      }
      await act(async () => controller.searchOptions('candidate'));
      await flush();
      const previous = controller;
      mocks.query.mockClear();
      mocks.options.mockClear();

      await act(async () => controller.changeType(type));
      await flush();

      expect(controller.subjectFilter).toEqual(selected);
      expect(controller.context).toBe(previous.context);
      expect(controller.result).toBe(previous.result);
      expect(controller.options).toBe(previous.options);
      expect(controller.directory).toBe(previous.directory);
      expect(controller.page).toBe(2);
      expect(controller.search).toBe('candidate');
      expect(controller.directoryId).toBe(type === 'department' ? b : '');
      expect(controller.isOpen).toBe(true);
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.options).not.toHaveBeenCalled();
      expect(mocks.toast).not.toHaveBeenCalled();

      await act(async () => controller.exportUsage(mapping));
      expect(mocks.download.mock.lastCall?.[0].body.subjectFilter).toEqual(selected);
      expect(mocks.query).not.toHaveBeenCalled();
    }
  );

  it.each(['member', 'group'] as const)(
    'keeps %s selection metadata while queries are pending or fail',
    async (type) => {
      await act(async () => controller.changeType(type));
      await flush();
      const first = { id: a, name: 'First', status: TeamMemberStatusEnum.active };
      const second = {
        id: b,
        name: 'Second',
        avatar: '/second.png',
        status: TeamMemberStatusEnum.forbidden
      };
      mocks.query.mockImplementation(async (body: UsageQueryBody) => ({
        ...responseFor(body),
        context: { ...contextFor(body), selectedItems: [first] }
      }));
      await act(async () => controller.toggleItem(first));
      await flush();
      const pending = deferred<UsageQueryResponse>();
      mocks.query.mockReturnValue(pending.promise);

      await act(async () => controller.toggleItem(second));
      const pendingSelection = controller.context?.selectedItems;
      expect(controller.loading).toBe(true);
      await act(async () => pending.reject(new Error('network')));

      expect(pendingSelection).toEqual([first, second]);
      expect(controller.context?.selectedItems).toEqual([first, second]);
      expect(controller.subjectFilter).toEqual({ type, ids: [a, b] });
      expect(controller.error).toBe(true);

      mocks.query.mockRejectedValue(new Error('network'));
      await act(async () => controller.toggleItem(first));
      await flush();
      expect(controller.context?.selectedItems).toEqual([second]);
      expect(controller.subjectFilter).toEqual({ type, ids: [b] });

      await act(async () => controller.clear());
      await flush();
      expect(controller.context?.selectedItems).toEqual([]);
      expect(controller.subjectFilter).toEqual({ type, ids: [] });
    }
  );

  it('preserves queued department commands when clicking the active type again', async () => {
    await act(async () => controller.changeType('department'));
    await flush();
    const first = deferred<UsageQueryResponse>();
    const commands: UsageQueryBody[] = [];
    mocks.query.mockImplementation(async (body: UsageQueryBody) => {
      if (!body.departmentAction) return responseFor(body);
      commands.push(body);
      if (commands.length === 1) return first.promise;
      const subject = body.subjectFilter as Extract<UsageSubjectFilter, { type: 'department' }>;
      return {
        ...responseFor(body),
        context: contextFor({
          ...body,
          subjectFilter: {
            type: 'department',
            rules: [...subject.rules, { orgId: b, include: true }]
          }
        })
      };
    });
    await act(async () => {
      controller.toggleDepartment(a);
      controller.toggleDepartment(b);
    });
    expect(commands).toHaveLength(1);
    await act(async () => controller.changeType('department'));
    expect(controller.loading).toBe(true);
    await act(async () =>
      first.resolve({
        ...responseFor(commands[0]),
        context: contextFor({
          ...commands[0],
          subjectFilter: { type: 'department', rules: [{ orgId: a, include: true }] }
        })
      })
    );
    await flush();
    expect(commands).toHaveLength(2);
    expect(commands[1].subjectFilter).toEqual({
      type: 'department',
      rules: [{ orgId: a, include: true }]
    });
    expect(controller.subjectFilter).toEqual({
      type: 'department',
      rules: [
        { orgId: a, include: true },
        { orgId: b, include: true }
      ]
    });
  });

  it.each(['success', 'failure'] as const)(
    'shows inherited normalization notices once after the final department command ends with %s',
    async (outcome) => {
      await act(async () => controller.changeType('department'));
      await flush();
      const original: UsageSubjectFilter = {
        type: 'department',
        rules: [{ orgId: a, include: true }]
      };
      mocks.query.mockImplementation(async (body: UsageQueryBody) =>
        responseFor({ ...body, subjectFilter: original })
      );
      await act(async () => controller.toggleDepartment(a));
      await flush();

      const first = deferred<UsageQueryResponse>();
      const second = deferred<UsageQueryResponse>();
      const commands: UsageQueryBody[] = [];
      mocks.query.mockImplementation((body: UsageQueryBody) => {
        commands.push(body);
        return commands.length === 1 ? first.promise : second.promise;
      });
      await act(async () => {
        controller.toggleDepartment(b);
        controller.toggleDepartment(c);
      });
      const normalized: UsageSubjectFilter = {
        type: 'department',
        rules: [{ orgId: b, include: true }]
      };
      const successful = responseFor({ ...commands[0], subjectFilter: normalized }, 42);
      successful.context.notices = ['DEPARTMENT_INVALID'];
      successful.context.selectionChanged = true;
      successful.context.resetPagination = true;
      await act(async () => first.resolve(successful));
      await flush();
      expect(commands[0].subjectFilter).toEqual(original);
      expect(commands[1].subjectFilter).toEqual(normalized);
      expect(controller.subjectFilter).toEqual(original);
      expect(mocks.toast).not.toHaveBeenCalled();

      const finalSubject: UsageSubjectFilter =
        outcome === 'success'
          ? { type: 'department', rules: [...normalized.rules, { orgId: c, include: true }] }
          : normalized;
      await act(async () => {
        if (outcome === 'success') {
          second.resolve(responseFor({ ...commands[1], subjectFilter: finalSubject }, 43));
        } else {
          second.reject(new Error('Second command failed'));
        }
      });
      await flush();
      expect(controller.subjectFilter).toEqual(finalSubject);
      expect(controller.result?.view === 'detail' && controller.result.data.total).toBe(
        outcome === 'success' ? 43 : 42
      );
      expect(mocks.toast.mock.calls.filter(([notice]) => notice.status === 'warning')).toEqual([
        [{ status: 'warning', title: 'account_usage:department_invalid' }]
      ]);
      expect(controller.error).toBe(outcome === 'failure');

      mocks.query.mockImplementation(async (body: UsageQueryBody) => responseFor(body));
      await act(async () => controller.changePage(2));
      await flush();
      expect(mocks.toast.mock.calls.filter(([notice]) => notice.status === 'warning')).toHaveLength(
        1
      );
    }
  );

  it('preserves normalization notices when a refresh supersedes a queued department command', async () => {
    await act(async () => controller.changeType('department'));
    await flush();
    const pending = deferred<UsageQueryResponse>();
    let command!: UsageQueryBody;
    mocks.query.mockImplementation((body: UsageQueryBody) => {
      if (!body.departmentAction) return Promise.resolve(responseFor(body));
      command = body;
      return pending.promise;
    });
    await act(async () => controller.toggleDepartment(a));
    await render({ view: 'dashboard' });
    await act(async () =>
      pending.resolve({
        ...responseFor(command),
        context: {
          ...contextFor(command),
          notices: ['DEPARTMENT_INVALID'],
          selectionChanged: true,
          resetPagination: true
        }
      })
    );
    await flush();

    expect(controller.result?.view).toBe('dashboard');
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      status: 'warning',
      title: 'account_usage:department_invalid'
    });
  });

  it.each([
    { change: 'date', initiallySelected: false, lastCommandFails: false },
    { change: 'date', initiallySelected: true, lastCommandFails: false },
    { change: 'view', initiallySelected: false, lastCommandFails: false },
    { change: 'view', initiallySelected: true, lastCommandFails: false },
    { change: 'date', initiallySelected: false, lastCommandFails: true },
    { change: 'date', initiallySelected: true, lastCommandFails: true }
  ])(
    'keeps department and export consistent after a $change refresh fails (selected=$initiallySelected, lastCommandFails=$lastCommandFails)',
    async ({ change, initiallySelected, lastCommandFails }) => {
      await render({ view: 'dashboard' });
      await act(async () => controller.changeType('department'));
      await flush();
      const selected: UsageSubjectFilter = {
        type: 'department',
        rules: [{ orgId: a, include: true }]
      };
      const empty: UsageSubjectFilter = { type: 'department', rules: [] };
      if (initiallySelected) {
        mocks.query.mockImplementation(async (body: UsageQueryBody) =>
          responseFor({ ...body, subjectFilter: selected })
        );
        await act(async () => controller.toggleDepartment(a));
        await flush();
      }
      const originalResult = controller.result;
      const pendingCommand = deferred<UsageQueryResponse>();
      const pendingRefresh = deferred<UsageQueryResponse>();
      let commandBody!: UsageQueryBody, refreshBody!: UsageQueryBody;
      mocks.query.mockImplementation((body: UsageQueryBody) => {
        if (body.departmentAction) {
          if (commandBody) return Promise.reject(new Error('Last command failed'));
          commandBody = body;
          return pendingCommand.promise;
        }
        refreshBody = body;
        return pendingRefresh.promise;
      });
      await act(async () => {
        controller.toggleDepartment(a);
        if (lastCommandFails) controller.toggleDepartment(b);
      });
      const nextView = change === 'view' ? 'detail' : 'dashboard';
      const nextFilters =
        change === 'date'
          ? {
              ...filters,
              dateRange: { ...filters.dateRange, from: new Date('2026-11-02T00:00:00Z') }
            }
          : filters;
      await render({ view: nextView, filters: nextFilters });
      const nextSubject = initiallySelected ? empty : selected;
      const successful = responseFor({ ...commandBody, subjectFilter: nextSubject });
      successful.context.notices = ['DEPARTMENT_INVALID'];
      await act(async () => pendingCommand.resolve(successful));
      await flush();

      expect(refreshBody.subjectFilter).toEqual(nextSubject);
      expect(refreshBody.view).toBe(nextView);
      expect(controller.subjectFilter).toEqual(nextSubject);
      expect(controller.context?.subjectFilter).toEqual(nextSubject);
      expect(controller.context?.selectedItems.map((item) => item.id)).toEqual(
        initiallySelected ? [] : [a]
      );
      expect(controller.result).toBe(originalResult);
      expect(controller.loading).toBe(true);

      await act(async () => pendingRefresh.reject(new Error('Latest refresh failed')));
      await flush();
      expect(controller.subjectFilter).toEqual(nextSubject);
      expect(controller.context?.subjectFilter).toEqual(nextSubject);
      expect(controller.result).toBe(originalResult);
      expect(controller.error).toBe(true);
      expect(controller.loading).toBe(false);
      expect(mocks.toast.mock.calls.filter(([notice]) => notice.status === 'warning')).toEqual([
        [{ status: 'warning', title: 'account_usage:department_invalid' }]
      ]);

      const displayed = controller.subjectFilter;
      await act(async () => controller.exportUsage(mapping));
      expect(mocks.download.mock.lastCall?.[0].body.subjectFilter).toEqual(displayed);
      expect(mocks.download.mock.lastCall?.[0].body.dateStart).toBe(refreshBody.filters.dateStart);
      mocks.query.mockImplementation(async (body: UsageQueryBody) => responseFor(body));
      await render({ view: nextView, filters: { ...nextFilters, projectName: 'Retry' } });
      expect(mocks.query.mock.lastCall?.[0].subjectFilter).toEqual(displayed);
      expect(controller.error).toBe(false);
      expect(mocks.toast.mock.calls.filter(([notice]) => notice.status === 'warning')).toHaveLength(
        1
      );
    }
  );

  it.each(['detail', 'dashboard'] as const)(
    'restores the last successful department selection and %s data when the final command fails',
    async (view) => {
      await render({ view });
      await act(async () => controller.changeType('department'));
      await flush();
      if (view === 'detail') {
        await act(async () => controller.changePage(3));
        await flush();
      }
      mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => ({
        ...optionsFor(body),
        context: {
          ...contextFor(body),
          departmentCheckStates: [a, b].map((orgId) => ({
            orgId,
            state:
              body.subjectFilter.type === 'department' &&
              body.subjectFilter.rules.some((rule) => rule.orgId === orgId && rule.include)
                ? 'all'
                : 'none'
          }))
        },
        options: [
          { id: a, name: 'A' },
          { id: b, name: 'B' }
        ]
      }));
      await act(async () => controller.open());
      await flush();
      const originalResult = controller.result;
      const first = deferred<UsageQueryResponse>();
      const second = deferred<UsageQueryResponse>();
      const commands: UsageQueryBody[] = [];
      mocks.query.mockClear().mockImplementation((body: UsageQueryBody) => {
        commands.push(body);
        return commands.length === 1 ? first.promise : second.promise;
      });
      mocks.options.mockClear();

      await act(async () => {
        controller.toggleDepartment(a);
        controller.toggleDepartment(b);
      });
      const selected: UsageSubjectFilter = {
        type: 'department',
        rules: [{ orgId: a, include: true }]
      };
      const successful = responseFor({ ...commands[0], subjectFilter: selected }, 42);
      await act(async () => first.resolve(successful));
      await flush();
      expect(commands).toHaveLength(2);
      expect(commands[1].subjectFilter).toEqual(selected);
      expect(controller.result).toBe(originalResult);
      expect(controller.subjectFilter).toEqual({ type: 'department', rules: [] });
      expect(controller.loading).toBe(true);

      await act(async () => second.reject(new Error('Second command failed')));
      await flush();

      expect(controller.subjectFilter).toEqual(selected);
      expect(controller.context?.subjectFilter).toEqual(selected);
      expect(controller.context?.selectedItems.map((item) => item.id)).toEqual([a]);
      expect(controller.context?.departmentCheckStates).toEqual([
        { orgId: a, state: 'all' },
        { orgId: b, state: 'none' }
      ]);
      expect(controller.result).toBe(successful);
      expect(controller.page).toBe(1);
      expect(controller.pageSize).toBe(20);
      expect(controller.loading).toBe(false);
      expect(controller.error).toBe(true);
      expect(mocks.options.mock.lastCall?.[0].subjectFilter).toEqual(selected);
      expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
        status: 'error',
        title: 'Second command failed'
      });
      expect(commands).toHaveLength(2);

      await act(async () => controller.exportUsage(mapping));
      expect(mocks.download.mock.lastCall?.[0].body.subjectFilter).toEqual(selected);
      mocks.query
        .mockReset()
        .mockImplementation(async (body: UsageQueryBody) => responseFor(body, 43));
      if (view === 'detail') {
        await act(async () => controller.changePage(2));
        await flush();
        expect(controller.page).toBe(2);
        expect(mocks.query.mock.lastCall?.[0].pagination).toEqual({
          pageNum: 2,
          pageSize: 20
        });
      } else {
        await render({ view, filters: { ...filters, projectName: 'Next app' } });
      }
      expect(mocks.query.mock.lastCall?.[0].subjectFilter).toEqual(selected);
    }
  );

  it('recovers the newest successful command after multiple queued successes and failures', async () => {
    await act(async () => controller.changeType('department'));
    await flush();
    const first = deferred<UsageQueryResponse>();
    const commands: UsageQueryBody[] = [];
    const selected: UsageSubjectFilter = {
      type: 'department',
      rules: [
        { orgId: a, include: true },
        { orgId: b, include: true }
      ]
    };
    let successful!: UsageQueryResponse;
    mocks.query.mockImplementation(async (body: UsageQueryBody) => {
      commands.push(body);
      if (commands.length === 1) return first.promise;
      if (commands.length === 2) {
        successful = responseFor({ ...body, subjectFilter: selected }, 22);
        return successful;
      }
      throw new Error('Command failed');
    });
    await act(async () => {
      controller.toggleDepartment(a);
      controller.toggleDepartment(b);
      controller.toggleDepartment(a);
      controller.toggleDepartment(b);
    });
    await act(async () =>
      first.resolve(
        responseFor({
          ...commands[0],
          subjectFilter: { type: 'department', rules: [{ orgId: a, include: true }] }
        })
      )
    );
    await flush();

    expect(commands).toHaveLength(4);
    expect(commands[2].subjectFilter).toEqual(selected);
    expect(commands[3].subjectFilter).toEqual(selected);
    expect(controller.subjectFilter).toEqual(selected);
    expect(controller.context?.subjectFilter).toEqual(selected);
    expect(controller.result).toBe(successful);
    expect(controller.error).toBe(true);
    expect(controller.loading).toBe(false);
    expect(mocks.toast).toHaveBeenCalledOnce();
  });

  it.each(['detail', 'dashboard'] as const)(
    'does not restore an invalidated department snapshot after a later command fails in %s',
    async (view) => {
      await render({ view });
      await act(async () => controller.changeType('department'));
      await flush();
      await act(async () => controller.open());
      await flush();
      const reload = deferred<UsageQueryResponse>();
      let reloadBody!: UsageQueryBody;
      const commands: UsageQueryBody[] = [];
      mocks.query.mockImplementation((body: UsageQueryBody) => {
        if (!body.departmentAction) {
          reloadBody = body;
          return reload.promise;
        }
        commands.push(body);
        if (commands.length > 1) return Promise.reject(new Error('Second command failed'));
        return Promise.resolve(
          responseFor({
            ...body,
            subjectFilter: { type: 'department', rules: [{ orgId: a, include: true }] }
          })
        );
      });
      mocks.options.mockImplementationOnce(async (body: UsageFilterOptionsBody) => ({
        ...optionsFor(body),
        context: {
          ...contextFor({ ...body, subjectFilter: { type: 'department', rules: [] } }),
          notices: ['DEPARTMENT_INVALID'],
          selectionChanged: true,
          resetPagination: true
        }
      }));

      await act(async () => controller.toggleDepartment(a));
      await flush();
      expect(controller.subjectFilter).toEqual({ type: 'department', rules: [] });
      expect(reloadBody.subjectFilter).toEqual({ type: 'department', rules: [] });
      expect(controller.result).toBeUndefined();
      await act(async () => {
        controller.toggleDepartment(b);
        controller.close();
      });
      await act(async () => reload.resolve(responseFor(reloadBody, 20)));
      await flush();

      expect(commands).toHaveLength(2);
      expect(commands[1].subjectFilter).toEqual({ type: 'department', rules: [] });
      expect(controller.subjectFilter).toEqual({ type: 'department', rules: [] });
      expect(controller.context?.selectedItems).toEqual([]);
      expect(controller.result).toBeUndefined();
      expect(controller.loading).toBe(false);
      expect(controller.error).toBe(true);
    }
  );

  it('keeps the displayed result when every command fails instead of restoring an older batch', async () => {
    await act(async () => controller.changeType('department'));
    await flush();
    const selected: UsageSubjectFilter = {
      type: 'department',
      rules: [{ orgId: a, include: true }]
    };
    mocks.query.mockImplementation(async (body: UsageQueryBody) =>
      responseFor({ ...body, subjectFilter: selected }, 10)
    );
    await act(async () => controller.toggleDepartment(a));
    await flush();
    mocks.query.mockImplementation(async (body: UsageQueryBody) => responseFor(body, 30));
    await act(async () => controller.changePage(3));
    await flush();
    const originalResult = controller.result;
    const first = deferred<UsageQueryResponse>();
    const commands: UsageQueryBody[] = [];
    mocks.query.mockImplementation((body: UsageQueryBody) => {
      commands.push(body);
      return commands.length === 1 ? first.promise : Promise.reject(new Error('Second failed'));
    });
    await act(async () => {
      controller.toggleDepartment(b);
      controller.toggleDepartment(a);
    });
    await act(async () => first.reject(new Error('First failed')));
    await flush();

    expect(commands).toHaveLength(2);
    expect(commands[1].subjectFilter).toEqual(selected);
    expect(controller.subjectFilter).toEqual(selected);
    expect(controller.context?.subjectFilter).toEqual(selected);
    expect(controller.result).toBe(originalResult);
    expect(controller.page).toBe(3);
    expect(controller.error).toBe(true);
    expect(controller.loading).toBe(false);
    expect(mocks.toast).toHaveBeenCalledOnce();
  });

  it.each(['team change', 'permission loss', 'subject change', 'clear'] as const)(
    'does not restore queued department results after %s when an obsolete command fails',
    async (operation) => {
      await act(async () => controller.changeType('department'));
      await flush();
      const first = deferred<UsageQueryResponse>();
      const second = deferred<UsageQueryResponse>();
      const commands: UsageQueryBody[] = [];
      let canManage = true;
      mocks.query.mockImplementation((body: UsageQueryBody) => {
        if (!body.departmentAction) return Promise.resolve(responseFor(body, 20, canManage));
        commands.push(body);
        return commands.length === 1 ? first.promise : second.promise;
      });
      await act(async () => {
        controller.toggleDepartment(a);
        controller.toggleDepartment(b);
      });
      await act(async () =>
        first.resolve({
          ...responseFor(commands[0], 999),
          context: {
            ...contextFor({
              ...commands[0],
              subjectFilter: { type: 'department', rules: [{ orgId: a, include: true }] }
            }),
            notices: ['DEPARTMENT_INVALID']
          }
        })
      );
      await flush();
      expect(commands).toHaveLength(2);

      if (operation === 'team change') {
        await render({ teamId: b });
      } else if (operation === 'permission loss') {
        canManage = false;
        await render({ canManage: false });
      } else {
        await act(async () => {
          if (operation === 'subject change') controller.changeType('group');
          else controller.clear();
        });
        await flush();
      }
      const nextResult = controller.result;
      const nextSubject = controller.subjectFilter;
      expect(nextResult?.view === 'detail' && nextResult.data.total).toBe(20);
      await act(async () => second.reject(new Error('Obsolete command failed')));
      await flush();

      expect(controller.result).toBe(nextResult);
      expect(controller.subjectFilter).toEqual(nextSubject);
      expect(controller.context?.scope).toBe(operation === 'permission loss' ? 'self' : 'team');
      expect(controller.loading).toBe(false);
      expect(controller.error).toBe(false);
      expect(mocks.toast).not.toHaveBeenCalled();
    }
  );

  it.each([401, 403])(
    'clears queued successful department results when the latest command fails with %s',
    async (code) => {
      await act(async () => controller.changeType('department'));
      await flush();
      const first = deferred<UsageQueryResponse>();
      const commands: UsageQueryBody[] = [];
      mocks.query.mockImplementation((body: UsageQueryBody) => {
        commands.push(body);
        return commands.length === 1
          ? first.promise
          : Promise.reject({ code, message: 'Authorization failed' });
      });
      await act(async () => {
        controller.toggleDepartment(a);
        controller.toggleDepartment(b);
      });
      await act(async () =>
        first.resolve(
          responseFor({
            ...commands[0],
            subjectFilter: { type: 'department', rules: [{ orgId: a, include: true }] }
          })
        )
      );
      await flush();

      expect(controller.result).toBeUndefined();
      expect(controller.context).toBeUndefined();
      expect(controller.subjectFilter).toEqual({ type: 'member', ids: [] });
      expect(controller.canManageMembers).toBe(false);
      expect(controller.loading).toBe(false);
      expect(controller.error).toBe(true);
      expect(mocks.toast).toHaveBeenCalledOnce();
    }
  );

  it.each([{ code: 401 }, { response: { status: 403 } }, { statusText: TeamErrEnum.unAuthTeam }])(
    'immediately blocks an earlier department authorization failure: %j',
    async (failure) => {
      await act(async () => controller.changeType('department'));
      await flush();
      mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => ({
        ...optionsFor(body),
        options: [{ id: a, name: 'Department A' }]
      }));
      await act(async () => controller.open());
      await flush();
      const first = deferred<UsageQueryResponse>();
      const second = deferred<UsageQueryResponse>();
      const commands: UsageQueryBody[] = [];
      mocks.query.mockImplementation((body: UsageQueryBody) => {
        commands.push(body);
        return commands.length === 1 ? first.promise : second.promise;
      });
      await act(async () => {
        controller.toggleDepartment(a);
        controller.toggleDepartment(b);
      });
      await act(async () => first.reject({ ...failure, message: 'Authorization failed' }));
      await flush();

      expect(commands).toHaveLength(1);
      expect(controller.result).toBeUndefined();
      expect(controller.context).toBeUndefined();
      expect(controller.subjectFilter).toEqual({ type: 'member', ids: [] });
      expect(controller.canManageMembers).toBe(false);
      expect(controller.isOpen).toBe(false);
      expect(controller.options).toEqual([]);
      expect(controller.directory).toBeUndefined();
      expect(controller.loading).toBe(false);
      expect(controller.error).toBe(true);
      expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
        status: 'error',
        title: 'Authorization failed'
      });
    }
  );

  it.each(['team change', 'permission loss', 'subject change', 'clear'] as const)(
    'ignores an obsolete department authorization failure after %s',
    async (operation) => {
      await act(async () => controller.changeType('department'));
      await flush();
      const pending = deferred<UsageQueryResponse>();
      let canManage = true;
      mocks.query.mockImplementation((body: UsageQueryBody) =>
        body.departmentAction ? pending.promise : Promise.resolve(responseFor(body, 20, canManage))
      );
      await act(async () => controller.toggleDepartment(a));
      if (operation === 'team change') {
        await render({ teamId: b });
      } else if (operation === 'permission loss') {
        canManage = false;
        await render({ canManage: false });
      } else {
        await act(async () => {
          if (operation === 'subject change') controller.changeType('group');
          else controller.clear();
        });
        await flush();
      }
      const currentResult = controller.result;
      const currentSubject = controller.subjectFilter;
      await act(async () =>
        pending.reject({ statusText: TeamErrEnum.unAuthTeam, message: 'Obsolete failure' })
      );
      await flush();

      expect(controller.result).toBe(currentResult);
      expect(controller.subjectFilter).toEqual(currentSubject);
      expect(controller.canManageMembers).toBe(canManage);
      expect(controller.loading).toBe(false);
      expect(controller.error).toBe(false);
      expect(mocks.toast).not.toHaveBeenCalled();
    }
  );

  it('keeps recovery available for a new queue when an obsolete queue finishes', async () => {
    await act(async () => controller.changeType('department'));
    await flush();
    const obsolete = deferred<UsageQueryResponse>();
    const first = deferred<UsageQueryResponse>();
    const second = deferred<UsageQueryResponse>();
    const commands: UsageQueryBody[] = [];
    mocks.query.mockImplementation((body: UsageQueryBody) => {
      if (!body.departmentAction) return Promise.resolve(responseFor(body));
      commands.push(body);
      return [obsolete, first, second][commands.length - 1].promise;
    });
    await act(async () => controller.toggleDepartment(b));
    await act(async () => controller.clear());
    await flush();
    await act(async () => {
      controller.toggleDepartment(a);
      controller.toggleDepartment(b);
    });
    const selected: UsageSubjectFilter = {
      type: 'department',
      rules: [{ orgId: a, include: true }]
    };
    const successful = responseFor({ ...commands[1], subjectFilter: selected }, 42);
    await act(async () => first.resolve(successful));
    await flush();
    expect(commands).toHaveLength(3);
    await act(async () => obsolete.reject(new Error('Obsolete command failed')));
    await flush();
    expect(controller.loading).toBe(true);
    expect(mocks.toast).not.toHaveBeenCalled();

    await act(async () => second.reject(new Error('Current command failed')));
    await flush();

    expect(controller.subjectFilter).toEqual(selected);
    expect(controller.result).toBe(successful);
    expect(controller.loading).toBe(false);
    expect(controller.error).toBe(true);
    expect(mocks.toast).toHaveBeenCalledOnce();
  });

  it.each(['detail', 'dashboard'] as const)(
    'immediately applies permission loss from an earlier department command in %s',
    async (view) => {
      await render({ view });
      await act(async () => controller.changeType('department'));
      await flush();
      mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => ({
        ...optionsFor(body),
        options: [{ id: a, name: 'Department A' }]
      }));
      await act(async () => controller.open());
      await flush();
      expect(controller.options).toHaveLength(1);
      const first = deferred<UsageQueryResponse>();
      const second = deferred<UsageQueryResponse>();
      const commands: UsageQueryBody[] = [];
      mocks.query.mockImplementation((body: UsageQueryBody) => {
        commands.push(body);
        return commands.length === 1 ? first.promise : second.promise;
      });
      await act(async () => {
        controller.toggleDepartment(a);
        controller.toggleDepartment(b);
      });
      const selfResult = responseFor(commands[0], 1, false);
      selfResult.context.notices = ['PERMISSION_CHANGED'];
      selfResult.context.scopeChanged = true;
      selfResult.context.resetPagination = true;
      await act(async () => first.resolve(selfResult));
      await flush();

      expect(commands).toHaveLength(1);
      expect(controller.subjectFilter).toEqual({ type: 'member', ids: [] });
      expect(controller.context?.scope).toBe('self');
      expect(controller.result).toBe(selfResult);
      expect(controller.canManageMembers).toBe(false);
      expect(controller.isOpen).toBe(false);
      expect(controller.options).toEqual([]);
      expect(controller.directory).toBeUndefined();
      expect(controller.loading).toBe(false);
      expect(controller.error).toBe(false);
      expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
        status: 'warning',
        title: 'account_usage:permission_changed'
      });
    }
  );

  it.each(['view change', 'filter change'] as const)(
    'reloads current data after an earlier command confirms permission loss during %s',
    async (operation) => {
      await act(async () => controller.changeType('department'));
      await flush();
      const first = deferred<UsageQueryResponse>();
      const latest = deferred<UsageQueryResponse>();
      const commands: UsageQueryBody[] = [];
      const queries: UsageQueryBody[] = [];
      mocks.query.mockImplementation((body: UsageQueryBody) => {
        if (body.departmentAction) {
          commands.push(body);
          return first.promise;
        }
        queries.push(body);
        return latest.promise;
      });
      await act(async () => {
        controller.toggleDepartment(a);
        controller.toggleDepartment(b);
      });
      const view = operation === 'view change' ? 'dashboard' : 'detail';
      const nextFilters =
        operation === 'filter change' ? { ...filters, projectName: 'Changed' } : filters;
      await render({ view, filters: nextFilters });
      const oldTeamResult = controller.result;
      const selfResult = responseFor(commands[0], 1, false);
      selfResult.context.notices = ['PERMISSION_CHANGED'];
      selfResult.context.scopeChanged = true;
      await act(async () => first.resolve(selfResult));
      await flush();

      expect(commands).toHaveLength(1);
      expect(controller.canManageMembers).toBe(false);
      expect(controller.context?.scope).toBe('self');
      expect(controller.result).toBeUndefined();
      expect(controller.loading).toBe(true);
      expect(queries).toHaveLength(1);
      expect(queries[0]).toMatchObject({
        view,
        expectedScope: 'self',
        subjectFilter: { type: 'member', ids: [] }
      });
      expect(queries[0].filters).toEqual({
        ...commands[0].filters,
        projectName: nextFilters.projectName
      });
      const currentResult = responseFor(queries[0], 27, false);
      await act(async () => latest.resolve(currentResult));
      await flush();

      expect(controller.result).toBe(currentResult);
      expect(controller.result).not.toBe(oldTeamResult);
      expect(controller.result).not.toBe(selfResult);
      expect(controller.result?.view).toBe(view);
      expect(controller.loading).toBe(false);
      expect(controller.error).toBe(false);
      expect(mocks.toast).toHaveBeenCalledOnce();
    }
  );

  it.each(['team change', 'subject change', 'clear'] as const)(
    'ignores permission loss from an obsolete department command after %s',
    async (operation) => {
      await act(async () => controller.changeType('department'));
      await flush();
      const pending = deferred<UsageQueryResponse>();
      let oldBody!: UsageQueryBody;
      mocks.query.mockImplementation((body: UsageQueryBody) => {
        if (body.departmentAction) {
          oldBody = body;
          return pending.promise;
        }
        return Promise.resolve(responseFor(body, 20));
      });
      await act(async () => controller.toggleDepartment(a));
      if (operation === 'team change') {
        await render({ teamId: b });
      } else {
        await act(async () => {
          if (operation === 'subject change') controller.changeType('group');
          else controller.clear();
        });
        await flush();
      }
      const currentResult = controller.result;
      const currentSubject = controller.subjectFilter;
      const selfResult = responseFor(oldBody, 1, false);
      selfResult.context.notices = ['PERMISSION_CHANGED'];
      await act(async () => pending.resolve(selfResult));
      await flush();

      expect(controller.result).toBe(currentResult);
      expect(controller.subjectFilter).toEqual(currentSubject);
      expect(controller.canManageMembers).toBe(true);
      expect(controller.context?.scope).toBe('team');
      expect(controller.loading).toBe(false);
      expect(mocks.toast).not.toHaveBeenCalled();
    }
  );

  it.each(['team change', 'permission loss', 'subject change', 'clear'] as const)(
    'starts fresh queries after %s without waiting for obsolete department commands',
    async (operation) => {
      await act(async () => controller.changeType('department'));
      await flush();
      const selected: UsageSubjectFilter = {
        type: 'department',
        rules: [{ orgId: a, include: true }]
      };
      mocks.query.mockImplementation(async (body: UsageQueryBody) => ({
        ...responseFor(body),
        context: contextFor({ ...body, subjectFilter: selected })
      }));
      await act(async () => controller.toggleDepartment(a));
      await flush();

      const pending = deferred<UsageQueryResponse>();
      const commands: UsageQueryBody[] = [];
      let canManage = true;
      mocks.query.mockClear().mockImplementation(async (body: UsageQueryBody) => {
        if (body.departmentAction) {
          commands.push(body);
          return pending.promise;
        }
        return responseFor(body, 20, canManage);
      });
      await act(async () => {
        controller.toggleDepartment(b);
        controller.toggleDepartment(a);
      });
      expect(commands).toHaveLength(1);
      expect(controller.loading).toBe(true);

      if (operation === 'team change') {
        await render({ teamId: b });
      } else if (operation === 'permission loss') {
        canManage = false;
        await render({ canManage: false });
      } else {
        await act(async () => {
          if (operation === 'subject change') controller.changeType('group');
          else controller.clear();
        });
        await flush();
      }

      const nextSubject: UsageSubjectFilter =
        operation === 'clear'
          ? { type: 'department', rules: [] }
          : { type: operation === 'subject change' ? 'group' : 'member', ids: [] };
      const nextResult = controller.result;
      expect(nextResult?.view === 'detail' && nextResult.data.total).toBe(20);
      expect(controller.subjectFilter).toEqual(nextSubject);
      expect(controller.context?.scope).toBe(operation === 'permission loss' ? 'self' : 'team');
      expect(controller.loading).toBe(false);
      expect(mocks.query).toHaveBeenCalledTimes(2);

      await act(async () =>
        pending.resolve({
          ...responseFor(commands[0], 999),
          context: {
            ...contextFor({ ...commands[0], subjectFilter: selected }),
            notices: ['DEPARTMENT_INVALID']
          }
        })
      );
      await flush();
      expect(commands).toHaveLength(1);
      expect(controller.result).toBe(nextResult);
      expect(controller.subjectFilter).toEqual(nextSubject);
      expect(controller.loading).toBe(false);
      expect(mocks.toast).not.toHaveBeenCalled();
    }
  );

  it('keeps selections across views and clears them on team changes', async () => {
    await act(async () =>
      controller.toggleItem({ id: a, name: 'A', status: TeamMemberStatusEnum.active })
    );
    await flush();
    await render({ view: 'dashboard' });
    expect(controller.subjectFilter).toEqual({ type: 'member', ids: [a] });
    expect(controller.result?.view).toBe('dashboard');
    await render({ teamId: b });
    expect(controller.subjectFilter).toEqual({ type: 'member', ids: [] });
    expect(controller.page).toBe(1);
    expect(controller.search).toBe('');
  });

  it('ignores old search options and keeps the newest query and subject', async () => {
    await act(async () => controller.open());
    await flush();
    const first = deferred<ReturnType<typeof optionsFor>>();
    let firstBody!: UsageFilterOptionsBody;
    mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => {
      if (body.intent === 'options' && body.searchKey === 'old') {
        firstBody = body;
        return first.promise;
      }
      return {
        ...optionsFor(body),
        options: [{ id: b, name: 'Newest', status: TeamMemberStatusEnum.active }]
      };
    });
    await act(async () => controller.searchOptions('old'));
    await act(async () => controller.searchOptions('new'));
    await flush();
    await act(async () =>
      first.resolve({
        ...optionsFor(firstBody),
        options: [{ id: a, name: 'Old', status: TeamMemberStatusEnum.active }]
      })
    );
    expect(controller.search).toBe('new');
    expect(controller.options[0].name).toBe('Newest');
  });

  it('browses, searches, navigates and appends candidates without reloading data or cancelling export', async () => {
    await act(async () => controller.changeType('department'));
    await flush();
    const originalResult = controller.result;
    const pending = deferred<{ kind: 'downloaded' }>();
    let downloadAbort!: AbortSignal;
    mocks.download.mockImplementation(({ signal }) => {
      downloadAbort = signal;
      return pending.promise;
    });
    let exporting!: Promise<void>;
    await act(async () => {
      exporting = controller.exportUsage(mapping);
    });
    mocks.query.mockClear();
    mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => ({
      ...optionsFor(body),
      options: [{ id: a, name: 'Candidate' }],
      hasMore: true
    }));

    for (const browse of [
      () => controller.open(),
      () => controller.searchOptions('candidate'),
      () => controller.navigate(b),
      () => controller.loadMore()
    ]) {
      await act(async () => browse());
      await flush();
      expect(controller.result).toBe(originalResult);
      expect(controller.loading).toBe(false);
      expect(controller.exporting).toBe(true);
      expect(downloadAbort.aborted).toBe(false);
    }
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.options.mock.lastCall?.[0].pagination.offset).toBe(1);
    await act(async () => {
      pending.resolve({ kind: 'downloaded' });
      await exporting;
    });
  });

  it('keeps a pending data query active while browsing candidates', async () => {
    const pending = deferred<UsageQueryResponse>();
    let body!: UsageQueryBody;
    let queryAbort!: AbortController;
    mocks.query.mockImplementation((next: UsageQueryBody, abort: AbortController) => {
      body = next;
      queryAbort = abort;
      return pending.promise;
    });
    await act(async () => controller.changePage(2));
    await act(async () => controller.open());
    await flush();
    expect(queryAbort.signal.aborted).toBe(false);
    expect(controller.loading).toBe(true);
    await act(async () => pending.resolve(responseFor(body, 42)));
    expect(controller.page).toBe(2);
    expect(controller.result?.view === 'detail' && controller.result.data.total).toBe(42);
    expect(controller.loading).toBe(false);
  });

  it('invalidates old data and export when candidate validation detects permission loss', async () => {
    const pendingQuery = deferred<UsageQueryResponse>();
    const pendingDownload = deferred<{ kind: 'downloaded' }>();
    let oldBody!: UsageQueryBody;
    let queryAbort!: AbortController;
    let exportAbort!: AbortSignal;
    mocks.query.mockImplementation((body: UsageQueryBody, abort: AbortController) => {
      if (body.expectedScope === 'self') return Promise.resolve(responseFor(body, 1, false));
      oldBody = body;
      queryAbort = abort;
      return pendingQuery.promise;
    });
    mocks.download.mockImplementation(({ signal }) => {
      exportAbort = signal;
      return pendingDownload.promise;
    });
    await act(async () => controller.changePage(2));
    let exporting!: Promise<void>;
    await act(async () => {
      exporting = controller.exportUsage(mapping);
    });
    mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => ({
      ...optionsFor(body, false),
      context: { ...contextFor(body, false), scopeChanged: true, resetPagination: true }
    }));
    await act(async () => controller.open());
    await flush();
    expect(queryAbort.signal.aborted).toBe(true);
    expect(exportAbort.aborted).toBe(true);
    expect(controller.result?.context.scope).toBe('self');
    expect(controller.canManageMembers).toBe(false);
    expect(controller.page).toBe(1);
    await act(async () => {
      pendingQuery.resolve(responseFor(oldBody, 999));
      pendingDownload.resolve({ kind: 'downloaded' });
      await exporting;
    });
    expect(controller.result?.view === 'detail' && controller.result.data.total).toBe(1);
    expect(controller.loading).toBe(false);
    expect(controller.exporting).toBe(false);
  });

  it.each(['page', 'page size'] as const)(
    'commits %s with its result and keeps the last successful pagination after failures',
    async (operation) => {
      await act(async () => controller.changePage(3));
      await flush();
      const originalResult = controller.result;
      const savedPageSize = dom.window.localStorage.getItem(
        'fastgpt:pagination:page-size:account-usage-detail'
      );
      const pending = deferred<UsageQueryResponse>();
      let body!: UsageQueryBody;
      mocks.query.mockImplementation((next: UsageQueryBody) => {
        body = next;
        return pending.promise;
      });
      const change = () =>
        operation === 'page' ? controller.changePage(4) : controller.changePageSize(50);
      await act(async () => change());
      expect(controller.page).toBe(3);
      expect(controller.pageSize).toBe(20);
      expect(controller.result).toBe(originalResult);
      expect(body.view === 'detail' && body.pagination).toEqual({
        pageNum: operation === 'page' ? 4 : 1,
        pageSize: operation === 'page' ? 20 : 50
      });
      await act(async () => pending.reject(new Error('network')));
      expect(controller.loading).toBe(false);
      expect(controller.page).toBe(3);
      expect(controller.pageSize).toBe(20);
      expect(controller.result).toBe(originalResult);
      expect(
        dom.window.localStorage.getItem('fastgpt:pagination:page-size:account-usage-detail')
      ).toBe(savedPageSize);

      mocks.query.mockImplementation(async (next: UsageQueryBody) => responseFor(next, 99));
      await act(async () => change());
      await flush();
      expect(controller.page).toBe(operation === 'page' ? 4 : 1);
      expect(controller.pageSize).toBe(operation === 'page' ? 20 : 50);
      expect(controller.result?.view === 'detail' && controller.result.data.total).toBe(99);
    }
  );

  it('invalidates a pending team query when concurrent export validation fails authorization', async () => {
    const pending = deferred<UsageQueryResponse>();
    let body!: UsageQueryBody;
    let queryAbort!: AbortController;
    mocks.query.mockImplementation((next: UsageQueryBody, abort: AbortController) => {
      body = next;
      queryAbort = abort;
      return pending.promise;
    });
    await act(async () => controller.changePage(2));
    mocks.options.mockRejectedValueOnce({ code: 403, message: 'Forbidden' });
    await act(async () => controller.exportUsage(mapping));
    expect(queryAbort.signal.aborted).toBe(true);
    expect(controller.result).toBeUndefined();
    expect(controller.context).toBeUndefined();
    expect(controller.canManageMembers).toBe(false);
    expect(controller.loading).toBe(false);
    expect(controller.exporting).toBe(false);

    await act(async () =>
      pending.resolve({
        ...responseFor(body, 999),
        context: { ...contextFor(body), notices: ['GROUP_INVALID'] }
      })
    );
    expect(controller.result).toBeUndefined();
    expect(controller.context).toBeUndefined();
    expect(controller.canManageMembers).toBe(false);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledOnce();
  });

  it('cancels export and rejects its late validation when a concurrent query fails authorization', async () => {
    const pendingQuery = deferred<UsageQueryResponse>();
    const pendingValidation = deferred<ReturnType<typeof optionsFor>>();
    let body!: UsageFilterOptionsBody;
    let validationAbort!: AbortController;
    mocks.query.mockReturnValue(pendingQuery.promise);
    mocks.options.mockImplementation((next: UsageFilterOptionsBody, abort: AbortController) => {
      body = next;
      validationAbort = abort;
      return pendingValidation.promise;
    });
    await act(async () => controller.changePage(2));
    let exporting!: Promise<void>;
    await act(async () => {
      exporting = controller.exportUsage(mapping);
    });
    await act(async () => pendingQuery.reject({ code: 401, message: 'Unauthorized' }));
    expect(validationAbort.signal.aborted).toBe(true);
    expect(controller.exporting).toBe(false);
    await act(async () => {
      pendingValidation.resolve(optionsFor(body));
      await exporting;
    });
    expect(controller.result).toBeUndefined();
    expect(controller.context).toBeUndefined();
    expect(controller.canManageMembers).toBe(false);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it.each(['detail', 'dashboard'] as const)(
    'keeps an in-flight %s query active when exporting the latest filters',
    async (view) => {
      await render({ view });
      const pending = deferred<UsageQueryResponse>();
      let pendingBody!: UsageQueryBody;
      let queryAbort!: AbortController;
      mocks.query.mockImplementation((body: UsageQueryBody, abort: AbortController) => {
        pendingBody = body;
        queryAbort = abort;
        return pending.promise;
      });
      await act(async () =>
        controller.toggleItem({ id: a, name: 'A', status: TeamMemberStatusEnum.active })
      );
      await flush();

      await act(async () => controller.exportUsage(mapping));

      expect(queryAbort.signal.aborted).toBe(false);
      expect(controller.loading).toBe(true);
      expect(controller.exporting).toBe(false);
      expect(mocks.download.mock.lastCall?.[0].body.subjectFilter).toEqual({
        type: 'member',
        ids: [a]
      });
      await act(async () => pending.resolve(responseFor(pendingBody, 3)));
      await flush();
      expect(controller.result?.context.subjectFilter).toEqual(controller.subjectFilter);
      expect(controller.loading).toBe(false);
    }
  );

  it('cancels an old export after filters change without disturbing the new query', async () => {
    const pending = deferred<{ kind: 'downloaded' }>();
    let downloadAbort!: AbortSignal;
    let isCurrent!: () => boolean;
    mocks.download.mockImplementation(({ signal, isCurrent: check }) => {
      downloadAbort = signal;
      isCurrent = check;
      return pending.promise;
    });
    let exporting!: Promise<void>;
    await act(async () => {
      exporting = controller.exportUsage(mapping);
    });
    await flush();
    expect(controller.exporting).toBe(true);

    await act(async () => controller.changeType('group'));
    await flush();
    expect(downloadAbort.aborted).toBe(true);
    expect(isCurrent()).toBe(false);
    await act(async () => {
      pending.resolve({ kind: 'downloaded' });
      await exporting;
    });
    expect(controller.result?.context.subjectFilter).toEqual({ type: 'group', ids: [] });
    expect(controller.exporting).toBe(false);
    expect(controller.loading).toBe(false);
  });

  it('rejects an export validation that predates a query detecting permission loss', async () => {
    const pendingQuery = deferred<UsageQueryResponse>();
    const pendingValidation = deferred<ReturnType<typeof optionsFor>>();
    let queryBody!: UsageQueryBody;
    let validationBody!: UsageFilterOptionsBody;
    mocks.query.mockImplementation((body: UsageQueryBody) => {
      queryBody = body;
      return pendingQuery.promise;
    });
    mocks.options.mockImplementation((body: UsageFilterOptionsBody) => {
      validationBody = body;
      return pendingValidation.promise;
    });
    await act(async () =>
      controller.toggleItem({ id: a, name: 'A', status: TeamMemberStatusEnum.active })
    );
    let exporting!: Promise<void>;
    await act(async () => {
      exporting = controller.exportUsage(mapping);
    });
    await flush();
    await act(async () => pendingQuery.resolve(responseFor(queryBody, 1, false)));
    expect(controller.canManageMembers).toBe(false);

    await act(async () => {
      pendingValidation.resolve(optionsFor(validationBody));
      await exporting;
    });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(controller.canManageMembers).toBe(false);
    expect(controller.subjectFilter).toEqual({ type: 'member', ids: [] });
    expect(controller.result?.context.scope).toBe('self');
    expect(controller.exporting).toBe(false);
  });

  it.each(['member', 'department', 'group'] as const)(
    'refreshes selected %s metadata during export without reloading unchanged records',
    async (type) => {
      await act(async () => controller.changeType(type));
      await flush();
      mocks.query.mockImplementation(async (body: UsageQueryBody) =>
        responseFor(
          body.departmentAction
            ? {
                ...body,
                subjectFilter: {
                  type: 'department',
                  rules: [{ orgId: body.departmentAction.orgId, include: true }]
                }
              }
            : body
        )
      );
      await act(async () =>
        controller.toggleItem({ id: a, name: 'Original', status: TeamMemberStatusEnum.active })
      );
      await flush();
      const originalResult = controller.result;
      const originalSubject = controller.subjectFilter;
      const updatedItem = {
        id: a,
        name: 'Renamed',
        avatar: '/new-avatar.png',
        status: TeamMemberStatusEnum.forbidden
      };
      mocks.query.mockClear();
      mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => ({
        ...optionsFor(body),
        context: { ...contextFor(body), selectedItems: [updatedItem] }
      }));

      await act(async () => controller.exportUsage(mapping));

      expect(controller.context?.selectedItems).toEqual([updatedItem]);
      expect(controller.subjectFilter).toEqual(originalSubject);
      expect(controller.result).toBe(originalResult);
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.download).toHaveBeenCalledOnce();
      expect(controller.exporting).toBe(false);
    }
  );

  it('downloads canonical department filters after validation removes an orphan exclusion', async () => {
    await act(async () => controller.changeType('department'));
    await flush();
    const selected: UsageSubjectFilter = {
      type: 'department',
      rules: [
        { orgId: a, include: true },
        { orgId: b, include: false }
      ]
    };
    mocks.query.mockImplementation(async (body: UsageQueryBody) => ({
      ...responseFor(body),
      context: contextFor({ ...body, subjectFilter: selected })
    }));
    await act(async () => controller.toggleDepartment(a));
    await flush();

    const normalized: UsageSubjectFilter = {
      type: 'department',
      rules: [{ orgId: a, include: true }]
    };
    mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => ({
      ...optionsFor(body),
      context: contextFor({ ...body, subjectFilter: normalized })
    }));
    let downloaded = false;
    mocks.download.mockImplementation(async ({ isCurrent }: { isCurrent: () => boolean }) => {
      if (!isCurrent()) return { kind: 'stale' };
      downloaded = true;
      return { kind: 'downloaded' };
    });
    mocks.query.mockClear();

    await act(async () => controller.exportUsage(mapping));

    expect(downloaded).toBe(true);
    expect(mocks.download.mock.lastCall?.[0].body.subjectFilter).toEqual(normalized);
    expect(controller.subjectFilter).toEqual(normalized);
    expect(controller.exporting).toBe(false);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('resets a deleted directory once when its department command returns normalized data', async () => {
    let deleted = false;
    mocks.query.mockImplementation(async (body: UsageQueryBody) => {
      const reset = deleted && body.departmentAction?.directoryId === b;
      const subjectFilter: UsageSubjectFilter = reset
        ? { type: 'department', rules: [] }
        : body.departmentAction
          ? {
              type: 'department',
              rules: [{ orgId: body.departmentAction.orgId, include: true }]
            }
          : body.subjectFilter;
      return {
        ...responseFor({ ...body, subjectFilter }, deleted ? 50 : 5),
        context: {
          ...contextFor({ ...body, subjectFilter }),
          ...(reset
            ? {
                notices: ['ORG_PATH_RESET'],
                selectionChanged: true,
                resetPagination: true
              }
            : {})
        }
      };
    });
    mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => {
      if (body.intent === 'validate') return optionsFor(body);
      if (deleted && body.departmentDirectoryId === b) {
        return {
          ...optionsFor(body),
          context: {
            ...contextFor({ ...body, subjectFilter: { type: 'department', rules: [] } }),
            notices: ['ORG_PATH_RESET'],
            selectionChanged: true,
            resetPagination: true
          }
        };
      }
      return {
        ...optionsFor(body),
        options: [{ id: a, name: body.departmentDirectoryId ? 'Old child' : 'Root child' }]
      };
    });
    await act(async () => controller.changeType('department'));
    await flush();
    await act(async () => controller.toggleDepartment(a));
    await flush();
    await act(async () => controller.open());
    await flush();
    await act(async () => controller.navigate(b));
    await flush();
    await act(async () => controller.searchOptions('old'));
    await flush();
    deleted = true;
    mocks.query.mockClear();
    mocks.options.mockClear();
    mocks.toast.mockClear();

    await act(async () => controller.toggleDepartment(a));
    await flush();

    expect(controller.directoryId).toBe('');
    expect(controller.search).toBe('');
    expect(controller.subjectFilter).toEqual({ type: 'department', rules: [] });
    expect(controller.options).toEqual([{ id: a, name: 'Root child' }]);
    expect(controller.result?.view === 'detail' && controller.result.data.total).toBe(50);
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.options).toHaveBeenCalledOnce();
    expect(mocks.options.mock.lastCall?.[0]).toMatchObject({
      departmentDirectoryId: '',
      searchKey: '',
      pagination: { offset: 0 }
    });
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      status: 'warning',
      title: 'account_usage:organization_updated'
    });
  });

  it.each(['search', 'load more'] as const)(
    'reloads the unfiltered root page when a browsing directory disappears during %s',
    async (operation) => {
      await act(async () => controller.changeType('department'));
      await flush();
      await act(async () => controller.open());
      await flush();
      await act(async () => controller.navigate(b));
      await flush();
      mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => ({
        ...optionsFor(body),
        options: [{ id: b, name: 'Old child' }],
        total: 2,
        hasMore: true
      }));
      await act(async () => controller.searchOptions('old'));
      await flush();
      mocks.options.mockClear().mockImplementation(async (body: UsageFilterOptionsBody) => {
        if (body.intent === 'options' && body.departmentDirectoryId === b) {
          return {
            ...optionsFor(body),
            context: {
              ...contextFor({ ...body, subjectFilter: { type: 'department', rules: [] } }),
              notices: ['ORG_PATH_RESET'],
              selectionChanged: true,
              resetPagination: true
            }
          };
        }
        return {
          ...optionsFor(body),
          options: [{ id: a, name: 'Root child' }],
          total: 1
        };
      });

      await act(async () => {
        if (operation === 'search') controller.searchOptions('old again');
        else controller.loadMore();
      });
      await flush();

      expect(mocks.options).toHaveBeenCalledTimes(2);
      expect(mocks.options.mock.lastCall?.[0]).toMatchObject({
        departmentDirectoryId: '',
        searchKey: '',
        pagination: { offset: 0 }
      });
      expect(controller.directoryId).toBe('');
      expect(controller.search).toBe('');
      expect(controller.options).toEqual([{ id: a, name: 'Root child' }]);
      expect(controller.directory?.total).toBe(1);
      expect(mocks.toast).toHaveBeenCalledOnce();
    }
  );

  it('ignores a pending root reload after changing the subject type', async () => {
    await act(async () => controller.changeType('department'));
    await flush();
    await act(async () => controller.open());
    await flush();
    await act(async () => controller.navigate(b));
    await flush();
    const pending = deferred<ReturnType<typeof optionsFor>>();
    let rootBody!: UsageFilterOptionsBody;
    mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => {
      if (body.subjectFilter.type !== 'department') return optionsFor(body);
      if (body.intent === 'options' && body.departmentDirectoryId === b) {
        return {
          ...optionsFor(body),
          context: {
            ...contextFor({ ...body, subjectFilter: { type: 'department', rules: [] } }),
            notices: ['ORG_PATH_RESET'],
            selectionChanged: true
          }
        };
      }
      rootBody = body;
      return pending.promise;
    });
    await act(async () => controller.searchOptions('old'));
    await flush();
    expect(rootBody).toBeDefined();
    await act(async () => controller.changeType('group'));
    await flush();
    await act(async () =>
      pending.resolve({
        ...optionsFor(rootBody),
        options: [{ id: a, name: 'Old root', status: TeamMemberStatusEnum.active }]
      })
    );
    expect(controller.subjectFilter).toEqual({ type: 'group', ids: [] });
    expect(controller.options).toEqual([]);
    expect(controller.loading).toBe(false);
  });

  it('clears old team data on permission loss and rejects late team responses', async () => {
    const pending = deferred<UsageQueryResponse>();
    let oldBody!: UsageQueryBody;
    mocks.query.mockImplementation(async (body: UsageQueryBody) => {
      if (body.subjectFilter.type === 'member' && body.subjectFilter.ids.length) {
        oldBody = body;
        return pending.promise;
      }
      return responseFor(body, 1, false);
    });
    await act(async () =>
      controller.toggleItem({ id: a, name: 'A', status: TeamMemberStatusEnum.active })
    );
    mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) =>
      optionsFor(body, false)
    );
    await render({ canManage: false });
    expect(controller.canManageMembers).toBe(false);
    expect(controller.result?.context.scope).toBe('self');
    await act(async () => pending.resolve(responseFor(oldBody, 999)));
    expect(controller.result?.view === 'detail' && controller.result.data.total).toBe(1);
    await act(async () => {
      await controller.exportUsage(mapping);
    });
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(controller.result?.context.scope).toBe('self');
  });

  it.each(['page', 'department', 'export conflict'] as const)(
    'reloads all records when options reset a deleted browsing directory after %s data',
    async (operation) => {
      mocks.query.mockImplementation(async (body: UsageQueryBody) => {
        const subject = body.subjectFilter;
        const rules =
          subject.type === 'department'
            ? [
                ...subject.rules,
                ...(body.departmentAction
                  ? [{ orgId: body.departmentAction.orgId, include: true }]
                  : [])
              ]
            : [];
        const normalized = {
          ...body,
          subjectFilter: { type: 'department' as const, rules }
        };
        return responseFor(normalized, rules.length ? 5 : 50);
      });
      await act(async () => controller.changeType('department'));
      await flush();
      await act(async () => controller.toggleDepartment(a));
      await flush();
      await act(async () => controller.open());
      await flush();
      await act(async () => controller.navigate(b));
      await flush();
      expect(controller.result?.view === 'detail' && controller.result.data.total).toBe(5);

      mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => {
        const response = optionsFor(body);
        if (body.intent === 'validate') return response;
        return {
          ...response,
          context: {
            ...contextFor({ ...body, subjectFilter: { type: 'department', rules: [] } }),
            notices: ['ORG_PATH_RESET'],
            selectionChanged: true,
            resetPagination: true
          }
        };
      });
      mocks.download.mockImplementation(async ({ body }) => ({
        kind: 'conflict',
        reason: 'USAGE_FILTER_CHANGED',
        context: { ...contextFor(body), selectionChanged: true }
      }));
      mocks.query.mockClear();

      await act(async () => {
        if (operation === 'page') controller.changePage(2);
        if (operation === 'department') controller.toggleDepartment(b);
        if (operation === 'export conflict') await controller.exportUsage(mapping);
      });
      await flush();

      expect(mocks.query).toHaveBeenCalledTimes(2);
      expect(mocks.query.mock.lastCall?.[0]).toMatchObject({
        subjectFilter: { type: 'department', rules: [] },
        pagination: { pageNum: 1 }
      });
      expect(controller.subjectFilter).toEqual({ type: 'department', rules: [] });
      expect(controller.result?.view === 'detail' && controller.result.data.total).toBe(50);
      expect(controller.page).toBe(1);
      expect(controller.directoryId).toBe('');
      expect(controller.loading).toBe(false);
    }
  );

  it('fetches self records when permission loss is first detected by the options response', async () => {
    await act(async () => controller.open());
    await flush();
    mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => ({
      ...optionsFor(body, false),
      context: {
        ...contextFor(body, false),
        scopeChanged: true,
        resetPagination: true,
        notices: ['PERMISSION_CHANGED']
      }
    }));
    mocks.query
      .mockClear()
      .mockImplementation(async (body: UsageQueryBody) =>
        responseFor(body, body.expectedScope === 'self' ? 1 : 50, body.expectedScope !== 'self')
      );

    await act(async () => controller.changePage(2));
    await flush();

    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.lastCall?.[0]).toMatchObject({
      expectedScope: 'self',
      subjectFilter: { type: 'member', ids: [] },
      pagination: { pageNum: 1 }
    });
    expect(controller.result?.view === 'detail' && controller.result.data.total).toBe(1);
    expect(controller.canManageMembers).toBe(false);
    expect(controller.isOpen).toBe(false);
  });

  it('ignores a pending normalized-range reload after the user changes filters', async () => {
    await act(async () => controller.open());
    await flush();
    const pending = deferred<UsageQueryResponse>();
    let oldBody!: UsageQueryBody;
    mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => ({
      ...optionsFor(body),
      context:
        body.subjectFilter.type === 'member'
          ? { ...contextFor(body), selectionChanged: true, resetPagination: true }
          : contextFor(body)
    }));
    mocks.query.mockImplementation(async (body: UsageQueryBody) => {
      if (
        body.subjectFilter.type === 'member' &&
        body.view === 'detail' &&
        body.pagination?.pageNum === 1
      ) {
        oldBody = body;
        return pending.promise;
      }
      return responseFor(body, 20);
    });
    await act(async () => controller.changePage(2));
    await flush();
    expect(oldBody).toBeDefined();
    await act(async () => controller.changeType('group'));
    await flush();
    await act(async () => pending.resolve(responseFor(oldBody, 999)));
    expect(controller.subjectFilter).toEqual({ type: 'group', ids: [] });
    expect(controller.result?.view === 'detail' && controller.result.data.total).toBe(20);
  });

  it('restores the existing page size cache, persists changes, and uses it after remount', async () => {
    const key = 'fastgpt:pagination:page-size:account-usage-detail';
    await act(async () => root.unmount());
    dom.window.localStorage.setItem(key, '50');
    root = createRoot(document.getElementById('host')!);
    await render();
    expect(controller.pageSize).toBe(50);
    expect(mocks.query.mock.lastCall?.[0].pagination.pageSize).toBe(50);
    await act(async () => controller.changePageSize(100));
    await flush();
    expect(dom.window.localStorage.getItem(key)).toBe('100');
    expect(mocks.query.mock.lastCall?.[0].pagination).toMatchObject({
      pageNum: 1,
      pageSize: 100
    });
    await act(async () => root.unmount());
    root = createRoot(document.getElementById('host')!);
    await render();
    expect(controller.pageSize).toBe(100);
    expect(mocks.query.mock.lastCall?.[0].pagination.pageSize).toBe(100);
  });

  it('falls back for unsupported cached page sizes and still works when storage writes fail', async () => {
    await act(async () => root.unmount());
    dom.window.localStorage.setItem('fastgpt:pagination:page-size:account-usage-detail', '30');
    root = createRoot(document.getElementById('host')!);
    await render();
    expect(controller.pageSize).toBe(20);
    const write = vi.spyOn(dom.window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });
    try {
      await act(async () => controller.changePageSize(50));
      await flush();
      expect(controller.pageSize).toBe(50);
      expect(mocks.query.mock.lastCall?.[0].pagination.pageSize).toBe(50);
    } finally {
      write.mockRestore();
    }
  });

  it('stops export when validate changes scope and updates the page before another export', async () => {
    mocks.options.mockImplementation(async (body: UsageFilterOptionsBody) => ({
      ...optionsFor(body, false),
      context: { ...contextFor(body, false), scopeChanged: true, notices: ['PERMISSION_CHANGED'] }
    }));
    mocks.query.mockImplementation(async (body: UsageQueryBody) => responseFor(body, 1, false));
    await act(async () => {
      await controller.exportUsage(mapping);
    });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(controller.canManageMembers).toBe(false);
    expect(controller.result?.context.scope).toBe('self');
    expect(mocks.toast).toHaveBeenCalledOnce();
  });

  it('handles final 409 without retrying the download and shares common filters with data', async () => {
    mocks.download.mockImplementation(async ({ body }) => ({
      kind: 'conflict',
      reason: 'USAGE_FILTER_CHANGED',
      context: { ...contextFor(body), selectionChanged: true, notices: ['GROUP_INVALID'] }
    }));
    await act(async () => {
      await controller.exportUsage(mapping);
    });
    expect(mocks.download).toHaveBeenCalledOnce();
    const exportFilters = mocks.download.mock.calls[0][0].body;
    const queryFilters = mocks.query.mock.lastCall![0].filters;
    expect(exportFilters).toMatchObject(queryFilters);
    expect(controller.exporting).toBe(false);
    expect(controller.result).toBeDefined();
  });

  it('clears cached team records on authorization failures without treating network failures as empty data', async () => {
    mocks.query.mockRejectedValueOnce(new Error('network'));
    await act(async () => controller.changePage(2));
    await flush();
    expect(controller.result).toBeDefined();
    expect(controller.error).toBe(true);
    mocks.query.mockRejectedValueOnce({ code: 403, message: 'Forbidden' });
    await act(async () => controller.changePage(3));
    await flush();
    expect(controller.result).toBeUndefined();
    expect(controller.options).toEqual([]);
    expect(controller.canManageMembers).toBe(false);
  });
});
