import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  router: {
    pathname: '/dashboard/tool',
    query: {} as Record<string, unknown>,
    push: vi.fn()
  }
}));

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ runAsync: vi.fn() })
}));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({
    openConfirm: () => () => undefined,
    ConfirmModal: () => null
  })
}));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@fastgpt/web/hooks/useResponsiveGridPageSize', () => ({
  useResponsiveGridPageSize: () => ({ columnCount: 3, pageSize: 20 }),
  getGridPageSize: (pageSize: number) => pageSize
}));
vi.mock('@fastgpt/web/hooks/useVirtualGridList', () => ({
  useVirtualGridList: ({ list }: { list: unknown[] }) => ({
    gridRef: { current: null },
    renderVirtualGridItems: (renderItem: (item: unknown) => React.ReactNode) =>
      list.map((item) => renderItem(item))
  })
}));
vi.mock('@/components/common/folder/useFolderDrag', () => ({
  useFolderDrag: () => ({ getBoxProps: () => ({}) })
}));
vi.mock('@/web/core/app/api', () => ({
  batchMoveApps: vi.fn(),
  delAppById: vi.fn(),
  resumeInheritPer: vi.fn(),
  changeOwner: vi.fn()
}));
vi.mock('@/web/core/app/api/app', () => ({ postCopyApp: vi.fn() }));
vi.mock('@/web/core/app/api/collaborator', () => ({
  getCollaboratorList: vi.fn(),
  postUpdateAppCollaborators: vi.fn()
}));
vi.mock('@/web/core/chat/context/useChatStore', () => ({
  useChatStore: () => ({ lastChatAppId: '', setLastChatAppId: vi.fn() })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: { team: { permission: { hasAppCreatePer: true } } } })
}));
vi.mock('@/pageComponents/app/constants', () => ({ createAppTypeMap: {} }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/UserBox', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/components/support/permission/IconText', () => ({ default: () => null }));
vi.mock('@/pageComponents/dashboard/ReferencedAppsPopover', () => ({ default: () => null }));
vi.mock('@/pageComponents/dashboard/agent/TypeTag', () => ({ default: () => null }));
vi.mock('@/pageComponents/dashboard/ListCreateCard', () => ({ default: () => null }));
vi.mock('@/pageComponents/dashboard/ResourceCardSkeleton', () => ({ default: () => null }));
vi.mock('@/pageComponents/dashboard/ResourceListCard', async () => {
  const React = await import('react');
  return {
    default: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children)
  };
});
vi.mock('@/pageComponents/dashboard/agent/context', async () => {
  const { createContext } = await import('use-context-selector');
  return { AppListContext: createContext({}) };
});
/**
 * 只关心菜单条目，把 MyMenu 的 menuList 拍平成文本，避免依赖 Chakra 弹层渲染。
 * menuList 既可能是分组（含 children），也可能是单个菜单项。
 */
vi.mock('@fastgpt/web/components/common/MyMenu', async () => {
  const React = await import('react');
  type MenuEntry = { label?: string; children?: MenuEntry[] };
  const MyMenu = ({ menuList }: { menuList: MenuEntry[] }) => {
    const labels = menuList.flatMap((item) =>
      item.children ? item.children.map((child) => String(child.label)) : [String(item.label)]
    );
    return React.createElement('span', { 'data-testid': 'app-menu-labels' }, labels.join('|'));
  };
  return { default: MyMenu };
});
vi.mock('@chakra-ui/react', async (importOriginal) => {
  const React = await import('react');
  const original = await importOriginal<typeof import('@chakra-ui/react')>();

  function MockDiv({ children }: { children?: React.ReactNode }) {
    return React.createElement('div', null, children);
  }
  function MockButton({ children }: { children?: React.ReactNode }) {
    return React.createElement('button', null, children);
  }
  function MockCheckbox() {
    return null;
  }
  /** List 会把 gridRef 挂到 Grid 上，mock 也要转发 ref，否则 React 会告警。 */
  const MockGrid = React.forwardRef<HTMLDivElement, { children?: React.ReactNode }>(
    function MockGrid({ children }, ref) {
      return React.createElement('div', { ref }, children);
    }
  );

  return {
    ...original,
    Box: MockDiv,
    Flex: MockDiv,
    Grid: MockGrid,
    HStack: MockDiv,
    VStack: MockDiv,
    IconButton: MockButton,
    Checkbox: MockCheckbox
  };
});

import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { AppListItemType } from '@fastgpt/global/core/app/type';
import { AppListContext } from '@/pageComponents/dashboard/agent/context';
import { defaultAppListFilters } from '@/pageComponents/dashboard/agent/filters/utils';
import List from '@/pageComponents/dashboard/agent/List';

const buildApp = (overrides: Partial<AppListItemType>): AppListItemType =>
  ({
    _id: 'app-id',
    parentId: null,
    tmbId: 'tmb-id',
    name: 'App',
    avatar: '',
    intro: '',
    type: AppTypeEnum.workflowTool,
    createTime: new Date('2026-01-01'),
    updateTime: new Date('2026-01-01'),
    permission: {
      hasManagePer: true,
      hasWritePer: true,
      hasReadChatLogPer: true,
      isOwner: true
    },
    sourceMember: { name: 'Owner', avatar: '', status: 'active' },
    private: false,
    relatedAppCount: 0,
    ...overrides
  }) as AppListItemType;

const buildContextValue = (myApps: AppListItemType[]) => ({
  parentId: null,
  appType: 'all' as const,
  myApps,
  loadMyApps: vi.fn(),
  isFetchingApps: false,
  isEmpty: false,
  ScrollData: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  folderDetail: undefined,
  paths: [],
  onUpdateApp: vi.fn(),
  setMoveAppId: vi.fn(),
  refetchFolderDetail: vi.fn(),
  searchKey: '',
  setSearchKey: vi.fn(),
  listFilters: defaultAppListFilters,
  setListFilters: vi.fn(),
  columnCount: 3,
  pageSize: 20,
  isBatchMode: false,
  setIsBatchMode: vi.fn(),
  selectedAppIds: [],
  setSelectedAppIds: vi.fn(),
  onToggleSelectApp: vi.fn(),
  onSelectAllApps: vi.fn(),
  isAllSelected: false,
  isIndeterminate: false,
  selectableApps: [],
  selectedApps: [],
  isBatchMoving: false,
  setIsBatchMoving: vi.fn(),
  isBatchDeleting: false,
  setIsBatchDeleting: vi.fn()
});

describe('dashboard 资源列表的复制菜单', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    vi.unstubAllGlobals();
  });

  const renderList = async (apps: AppListItemType[]) => {
    await act(async () => {
      /* eslint-disable react/no-children-prop -- Context Provider 的 children 为必填，需要显式传入以满足类型约束。 */
      root.render(
        React.createElement(AppListContext.Provider, {
          value: buildContextValue(apps),
          children: React.createElement(List)
        })
      );
      /* eslint-enable react/no-children-prop */
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return container.querySelector('[data-testid="app-menu-labels"]')?.textContent ?? '';
  };

  it('工具文件夹不显示「创建副本」', async () => {
    // 工具文件夹可管理且可写，但复制后会进入没有文件夹视图的详情页，必须隐藏复制入口。
    const menuLabels = await renderList([
      buildApp({ _id: 'tool-folder', type: AppTypeEnum.toolFolder })
    ]);

    // 先确认菜单确实渲染出来了，避免整块菜单缺失时“不包含复制”被误判为通过。
    expect(menuLabels).toContain('common:permission.Permission');
    expect(menuLabels).not.toContain('app:copy_one_app');
  });

  it('可写的工作流工具显示「创建副本」', async () => {
    // 正例：普通工具仍要保留复制入口，避免把菜单整体关掉。
    const menuLabels = await renderList([
      buildApp({ _id: 'workflow-tool', type: AppTypeEnum.workflowTool })
    ]);

    expect(menuLabels).toContain('app:copy_one_app');
  });
});
