import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  router: {
    pathname: '/dashboard/agent',
    query: { parentId: 'navigation-folder' },
    push: vi.fn()
  },
  getAppFolderPath: vi.fn(),
  getAppDetailById: vi.fn(),
  putAppById: vi.fn(),
  fetchData: vi.fn(),
  onClose: vi.fn(),
  filterStore: {} as Record<string, unknown>,
  setFilterStore: vi.fn()
}));

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/web/core/app/api', () => ({
  batchMoveApps: vi.fn(),
  getAppDetailById: mocks.getAppDetailById,
  getMyAppsV2: vi.fn(),
  putAppById: mocks.putAppById
}));
vi.mock('@/web/core/app/api/app', () => ({ getAppFolderPath: mocks.getAppFolderPath }));
vi.mock('@fastgpt/web/hooks/useScrollPagination', () => ({
  useScrollPagination: () => ({
    data: [],
    isLoading: false,
    isEmpty: false,
    ScrollData: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    fetchData: mocks.fetchData
  })
}));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({
    openConfirm: () => () => undefined,
    ConfirmModal: () => null
  })
}));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { isPlus: false }, setLastAppListRouteType: vi.fn() })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: { team: { teamId: 'team-id' } } })
}));
vi.mock('@fastgpt/web/hooks/usePersistedFilters', () => ({
  usePersistedFilters: () => [mocks.filterStore, mocks.setFilterStore]
}));
vi.mock('@fastgpt/web/hooks/useResponsiveGridPageSize', () => ({
  useResponsiveGridPageSize: () => ({ columnCount: 3, pageSize: 20 }),
  getGridRequestPageSize: (pageSize: number) => pageSize
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@fastgpt/web/components/common/batch/BatchActionBar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/v2/common/MyModal', async () => {
  const React = await import('react');
  return {
    default: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) =>
      React.createElement('div', { role: 'dialog' }, children, footer)
  };
});
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('label', null, children)
}));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/common/file/hooks/useUploadAvatar', () => ({
  useUploadAvatar: () => ({ Component: () => null, handleFileSelectorOpen: vi.fn() })
}));
vi.mock('@/web/common/file/api', () => ({ getUploadAvatarPresignedUrl: vi.fn() }));
vi.mock('@chakra-ui/react', async (importOriginal) => {
  const React = await import('react');
  const original = await importOriginal<typeof import('@chakra-ui/react')>();
  const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
    ({ autoFocus: _autoFocus, ...props }, ref) => React.createElement('input', { ...props, ref })
  );
  const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
    (_props, ref) => React.createElement('textarea', { ref })
  );
  const Button = ({
    children,
    isLoading,
    ...props
  }: React.ComponentProps<'button'> & { isLoading?: boolean }) =>
    React.createElement(
      'button',
      { ...props, 'data-loading': String(Boolean(isLoading)) },
      children
    );
  const Box = ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children);
  const Flex = ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children);
  return { ...original, Input, Textarea, Button, Box, Flex };
});

import { useContextSelector } from 'use-context-selector';
import EditResourceModal from '@/components/common/Modal/EditResourceModal';
import AppListContextProvider, { AppListContext } from '@/pageComponents/dashboard/agent/context';
import { defaultAppListFiltersStore } from '@/pageComponents/dashboard/agent/filters/utils';

describe('editing an app from a navigation-only folder', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    mocks.router.query = { parentId: 'navigation-folder' };
    mocks.filterStore = defaultAppListFiltersStore;
    mocks.getAppFolderPath.mockResolvedValue([
      {
        parentId: 'navigation-folder',
        parentName: 'Navigation folder',
        folderAccessMode: 'navigate'
      }
    ]);
    mocks.getAppDetailById.mockImplementation(() => new Promise(() => {}));
    mocks.putAppById.mockResolvedValue({});
    mocks.fetchData.mockResolvedValue(undefined);
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

  it('closes the edit modal after renaming a writable app without waiting for inaccessible folder details', async () => {
    const EditHarness = () => {
      const onUpdateApp = useContextSelector(AppListContext, (value) => value.onUpdateApp);
      return React.createElement(EditResourceModal, {
        id: 'writable-app',
        name: 'Renamed app',
        title: 'Edit app',
        onClose: mocks.onClose,
        onEdit: ({ id, ...data }) => onUpdateApp(id, data)
      });
    };

    await act(async () => {
      root.render(
        React.createElement(AppListContextProvider, null, React.createElement(EditHarness))
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const confirmButton = container.querySelectorAll('button')[1];
    expect(confirmButton).toBeDefined();
    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.putAppById).toHaveBeenCalledWith(
      'writable-app',
      expect.objectContaining({ name: 'Renamed app' })
    );
    expect(confirmButton?.getAttribute('data-loading')).toBe('false');
    expect(mocks.onClose).toHaveBeenCalledOnce();
    expect(mocks.getAppDetailById).not.toHaveBeenCalled();
  });
});
