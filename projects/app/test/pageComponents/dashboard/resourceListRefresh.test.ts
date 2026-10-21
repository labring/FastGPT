import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextSelector } from 'use-context-selector';
import { AppListSortEnum } from '@fastgpt/global/core/app/constants';
import AppListContextProvider, { AppListContext } from '@/pageComponents/dashboard/agent/context';
import SkillListContextProvider, {
  SkillListContext
} from '@/pageComponents/dashboard/skill/context';
import DatasetContextProvider, { DatasetsContext } from '@/pageComponents/dataset/list/context';

const mocks = vi.hoisted(() => ({
  pathname: '/dashboard/agent',
  parentId: '68ad85a7463006c963799a05',
  creatorId: '68ad85a7463006c963799a06',
  pagination: vi.fn(),
  fetchData: vi.fn(),
  refreshItems: vi.fn(),
  appApi: vi.fn(),
  datasetApi: vi.fn(),
  skillApi: vi.fn()
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: mocks.pathname, query: { parentId: mocks.parentId } })
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/common/batch/BatchActionBar', () => ({ default: () => null }));
vi.mock('@/pageComponents/dataset/list/BatchDeleteModal', () => ({ default: () => null }));
vi.mock('@/pageComponents/dashboard/skill/BatchDeleteModal', () => ({ default: () => null }));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: { team: { teamId: 'team' } } })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { isPlus: true }, setLastAppListRouteType: vi.fn() })
}));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('@fastgpt/web/hooks/useResponsiveGridPageSize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/web/hooks/useResponsiveGridPageSize')>()),
  useResponsiveGridPageSize: () => ({ columnCount: 4, pageSize: 50 })
}));
vi.mock('@fastgpt/web/hooks/usePersistedFilters', () => ({
  usePersistedFilters: ({ defaultValue }: { defaultValue: Record<string, object> }) => [
    Object.fromEntries(
      Object.entries(defaultValue).map(([key, value]) => [
        key,
        {
          ...value,
          sort: AppListSortEnum.createTimeAsc,
          creator: { mode: 'selected', tmbIds: [mocks.creatorId] }
        }
      ])
    ),
    vi.fn()
  ]
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ run: vi.fn(), runAsync: vi.fn() })
}));
vi.mock('@fastgpt/web/hooks/useScrollPagination', () => ({
  useScrollPagination: mocks.pagination
}));
vi.mock('@/web/core/app/api', () => ({
  getMyAppsV2: mocks.appApi,
  batchMoveApps: vi.fn(),
  getAppDetailById: vi.fn(),
  putAppById: vi.fn()
}));
vi.mock('@/web/core/app/api/app', () => ({ getAppFolderPath: vi.fn() }));
vi.mock('@/web/core/dataset/api', () => ({
  getDatasetsV2: mocks.datasetApi,
  getDatasetPaths: vi.fn(),
  putDatasetById: vi.fn(),
  batchMoveDatasets: vi.fn(),
  getDatasetById: vi.fn(),
  delDatasetById: vi.fn()
}));
vi.mock('@/web/core/skill/api', () => ({
  getSkillListV2: mocks.skillApi,
  getSkillFolderPath: vi.fn(),
  getSkillDetail: vi.fn(),
  batchMoveSkills: vi.fn()
}));

describe('resource list ID refresh integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchData.mockResolvedValue(undefined);
    mocks.refreshItems.mockResolvedValue(undefined);
    mocks.pagination.mockReturnValue({
      data: [],
      isLoading: false,
      isEmpty: false,
      ScrollData: () => null,
      fetchData: mocks.fetchData,
      refreshItems: mocks.refreshItems
    });
  });

  it.each([
    {
      name: 'agent',
      pathname: '/dashboard/agent',
      Provider: AppListContextProvider,
      useRefresh: () => useContextSelector(AppListContext, (value) => value.loadMyApps),
      api: mocks.appApi,
      idField: 'appIds'
    },
    {
      name: 'tool',
      pathname: '/dashboard/tool',
      Provider: AppListContextProvider,
      useRefresh: () => useContextSelector(AppListContext, (value) => value.loadMyApps),
      api: mocks.appApi,
      idField: 'appIds'
    },
    {
      name: 'dataset',
      pathname: '/dataset/list',
      Provider: DatasetContextProvider,
      useRefresh: () => useContextSelector(DatasetsContext, (value) => value.loadMyDatasets),
      api: mocks.datasetApi,
      idField: 'datasetIds'
    },
    {
      name: 'skill',
      pathname: '/dashboard/skill',
      Provider: SkillListContextProvider,
      useRefresh: () => useContextSelector(SkillListContext, (value) => value.refreshSkills),
      api: mocks.skillApi,
      idField: 'skillIds'
    }
  ])(
    'uses IDs and retains common filters for $name',
    async ({ pathname, Provider, useRefresh, api, idField }) => {
      mocks.pathname = pathname;
      const item = {
        _id: '68ad85a7463006c963799a07',
        createTime: '2026-01-01T00:00:00.000Z',
        updateTime: '2026-02-01T00:00:00.000Z'
      };
      api.mockResolvedValue({ list: [item], total: 1 });
      let refresh: ReturnType<typeof useRefresh> | undefined;
      const Probe = () => {
        refresh = useRefresh();
        return null;
      };
      renderToStaticMarkup(React.createElement(Provider, null, React.createElement(Probe)));

      await refresh!({ silent: true, resourceId: item._id });
      expect(mocks.refreshItems).toHaveBeenLastCalledWith([item._id]);
      expect(mocks.fetchData).not.toHaveBeenCalled();
      await refresh!({ silent: true });
      expect(mocks.refreshItems).toHaveBeenLastCalledWith(undefined);
      await refresh!();
      expect(mocks.fetchData).toHaveBeenLastCalledWith({ init: true });

      const [loadPage, options] = mocks.pagination.mock.lastCall!;
      const controller = new AbortController();
      const list = await options.refreshByIds.api([item._id], controller);
      const [body, token] = api.mock.lastCall!;
      expect(body).toMatchObject({
        [idField]: [item._id],
        searchKey: '',
        sort: AppListSortEnum.createTimeAsc,
        tmbIds: [mocks.creatorId]
      });
      for (const field of ['parentId', 'offset', 'pageSize', 'pageNum', 'page']) {
        expect(body).not.toHaveProperty(field);
      }
      expect(token).toBe(controller);
      expect(options.refreshByIds.getId(item)).toBe(item._id);
      expect(list[0]._id).toBe(item._id);
      if (idField === 'skillIds') {
        expect(body.source).toBe('mine');
        expect(list[0].createTime).toEqual(new Date(item.createTime));
        expect(list[0].updateTime).toEqual(new Date(item.updateTime));
      } else if (idField === 'appIds') {
        expect(body.withRelatedAppCount).toBe(true);
      }
      if (idField !== 'appIds') {
        expect(body.withAppCount).toBe(true);
      }
      if (idField === 'datasetIds') {
        expect(body.withFileCount).toBe(true);
      }

      await loadPage({ offset: 20, pageSize: 50 }, controller);
      expect(api.mock.lastCall?.[0]).toMatchObject({
        parentId: mocks.parentId,
        offset: 20,
        pageSize: 50
      });
      expect(api.mock.lastCall?.[0]).not.toHaveProperty(idField);
      if (idField !== 'appIds') {
        expect(api.mock.lastCall?.[0].withAppCount).toBe(true);
      }
      if (idField === 'datasetIds') {
        expect(api.mock.lastCall?.[0].withFileCount).toBe(true);
      }
      expect(api.mock.lastCall?.[1]).toBe(controller);
    }
  );
});
