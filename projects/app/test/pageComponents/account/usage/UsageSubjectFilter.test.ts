import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UsageSubjectFilter from '@/pageComponents/account/usage/UsageSubjectFilter';
import type { UsageFilterController } from '@/pageComponents/account/usage/useUsageFilterController';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';

vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: ({ name }: { name: string }) => React.createElement('span', { 'data-icon': name })
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({
  default: ({ src }: { src?: string }) => React.createElement('img', { src: src ?? '' })
}));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children)
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params?.name ? `${key}:${params.name}` : key
  })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: { team: { tmbId: 'self-id' } } })
}));

const createController = (
  overrides: Partial<UsageFilterController> = {}
): UsageFilterController => ({
  canManageMembers: true,
  subjectFilter: { type: 'department', ids: [] },
  context: undefined,
  isOpen: true,
  optionsLoading: false,
  exporting: false,
  search: '',
  directoryId: '',
  options: [],
  directory: {
    breadcrumbs: [{ id: '', name: 'Team' }]
  },
  requestParams: {
    dateStart: '2026-11-01T00:00:00.000Z',
    dateEnd: '2026-11-03T00:00:00.000Z',
    sources: undefined,
    projectName: undefined,
    subjectFilter: { type: 'department', ids: [] },
    expectedScope: 'team'
  },
  queryKey: 'key',
  open: vi.fn(),
  close: vi.fn(),
  changeType: vi.fn(),
  toggleItem: vi.fn(),
  clear: vi.fn(),
  searchOptions: vi.fn(),
  navigate: vi.fn(),
  loadMore: vi.fn(),
  fetchUsages: vi.fn(),
  fetchDashboard: vi.fn(),
  exportUsage: vi.fn(),
  ...overrides
});

describe('UsageSubjectFilter', () => {
  let dom: JSDOM;
  let root: Root;

  const render = async (controller: UsageFilterController) => {
    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(UsageSubjectFilter, { controller })
        )
      );
    });
  };

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('SVGElement', dom.window.SVGElement);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
    vi.stubGlobal('FocusEvent', dom.window.FocusEvent);
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      dom.window.setTimeout(() => cb(0), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', dom.window.clearTimeout.bind(dom.window));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createRoot(dom.window.document.getElementById('root')!);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('isolates parent department selection from child directory navigation across input, control, row and chevron button', async () => {
    const parentDept = {
      id: '200000000000000000000001',
      name: 'FastGPT',
      status: TeamMemberStatusEnum.active,
      hasChildren: true
    };
    const controller = createController({
      subjectFilter: { type: 'department', ids: [] },
      options: [parentDept]
    });

    await render(controller);

    const checkboxInput = dom.window.document.querySelector(
      'input[type="checkbox"][aria-label="FastGPT"]'
    ) as HTMLInputElement | null;
    const checkboxControl = dom.window.document.querySelector(
      '.chakra-checkbox__control'
    ) as HTMLElement | null;
    const rowLabel = Array.from(dom.window.document.querySelectorAll('div')).find(
      (el) => el.textContent === 'FastGPT' && el.classList.contains('textEllipsis')
    );
    expect(checkboxInput).not.toBeNull();
    expect(checkboxControl).not.toBeNull();
    expect(rowLabel).toBeDefined();

    await act(async () => {
      checkboxInput!.click();
    });
    expect(controller.toggleItem).toHaveBeenCalledTimes(1);
    expect(controller.navigate).not.toHaveBeenCalled();

    await act(async () => {
      checkboxControl!.click();
    });
    expect(controller.toggleItem).toHaveBeenCalledTimes(2);
    expect(controller.navigate).not.toHaveBeenCalled();

    await act(async () => {
      rowLabel!.click();
    });
    expect(controller.toggleItem).toHaveBeenCalledTimes(3);
    expect(controller.navigate).not.toHaveBeenCalled();

    const drillDownBtn = dom.window.document.querySelector(
      'button[aria-label="account_usage:open_department:FastGPT"]'
    ) as HTMLButtonElement | null;
    expect(drillDownBtn).not.toBeNull();
    drillDownBtn!.focus();
    expect(dom.window.document.activeElement).toBe(drillDownBtn);

    await act(async () => {
      drillDownBtn!.click();
    });
    expect(controller.navigate).toHaveBeenCalledTimes(1);
    expect(controller.navigate).toHaveBeenCalledWith(parentDept.id);
    expect(controller.toggleItem).toHaveBeenCalledTimes(3);
    expect(controller.close).not.toHaveBeenCalled();
  });

  it('exposes focusable button entries for subject types and clear-all', async () => {
    const controller = createController({
      subjectFilter: { type: 'member', ids: ['200000000000000000000001'] },
      isOpen: true,
      options: []
    });

    await render(controller);

    const allButton = Array.from(dom.window.document.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'common:All'
    );
    expect(allButton).toBeDefined();
    allButton!.focus();
    expect(dom.window.document.activeElement).toBe(allButton);
    await act(async () => {
      allButton!.click();
    });
    expect(controller.clear).toHaveBeenCalledTimes(1);

    const triggers = dom.window.document.querySelectorAll('button[aria-haspopup="dialog"]');
    await act(async () => {
      (triggers[0] as HTMLButtonElement).click();
    });
    expect(controller.close).toHaveBeenCalledTimes(1);

    const groupTypeButton = Array.from(dom.window.document.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'account_usage:group'
    );
    expect(groupTypeButton).toBeDefined();
    groupTypeButton!.focus();
    expect(dom.window.document.activeElement).toBe(groupTypeButton);
    await act(async () => {
      groupTypeButton!.click();
    });
    expect(controller.changeType).toHaveBeenCalledWith('group');
  });
});
