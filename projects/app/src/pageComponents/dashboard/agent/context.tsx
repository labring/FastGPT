import React, { type ReactNode, useCallback, useEffect, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useRouter } from 'next/router';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useScrollPagination, type ScrollListType } from '@fastgpt/web/hooks/useScrollPagination';
import { getAppDetailById, getMyAppsV2, putAppById } from '@/web/core/app/api';
import type { SelectOneResourceServer } from '@/components/common/folder/SelectOneResource';
import { type AppDetailType, type AppListItemType } from '@fastgpt/global/core/app/type';
import { getAppFolderPath } from '@/web/core/app/api/app';
import {
  type ParentIdType,
  type ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { type UpdateAppBodyType } from '@fastgpt/global/openapi/core/app/common/api';
import dynamic from 'next/dynamic';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useTranslation } from 'next-i18next';
import { usePersistedFilters } from '@fastgpt/web/hooks/usePersistedFilters';
import { useUserStore } from '@/web/support/user/useUserStore';
import { buildFilterStorageKey } from '@/web/common/filter/storageKey';
import { getDashboardAppListScene, resolveDashboardAppListTypes } from './utils/appListTypes';
import {
  AppListFiltersStoreSchema,
  buildAppListRequest,
  defaultAppListFilters,
  defaultAppListFiltersStore,
  resolveSceneListType,
  toListTmbIds,
  type AppListFilterType,
  type AppListFilterScene
} from './filters/utils';
import {
  getGridRequestPageSize,
  useResponsiveGridPageSize
} from '@fastgpt/web/hooks/useResponsiveGridPageSize';
const MoveModal = dynamic(() => import('@/components/common/folder/MoveModal'));

type AppListContextType = {
  parentId?: string | null;
  appType: AppTypeEnum | 'all';
  myApps: AppListItemType[];
  loadMyApps: () => Promise<void>;
  isFetchingApps: boolean;
  isEmpty: boolean;
  ScrollData: ScrollListType;
  folderDetail: AppDetailType | undefined | null;
  paths: ParentTreePathItemType[];
  onUpdateApp: (id: string, data: UpdateAppBodyType) => Promise<any>;
  setMoveAppId: React.Dispatch<React.SetStateAction<string | undefined>>;
  refetchFolderDetail: () => Promise<AppDetailType | null>;
  searchKey: string;
  setSearchKey: React.Dispatch<React.SetStateAction<string>>;
  listFilters: AppListFilterType;
  setListFilters: (
    next: AppListFilterType | ((prev: AppListFilterType) => AppListFilterType)
  ) => void;
  columnCount: number;
  pageSize: number;
};

export const AppListContext = createContext<AppListContextType>({
  parentId: undefined,
  myApps: [],
  loadMyApps: async function (): Promise<void> {
    throw new Error('Function not implemented.');
  },
  isFetchingApps: false,
  isEmpty: false,
  ScrollData: () => <></>,
  folderDetail: undefined,
  paths: [],
  onUpdateApp: function (id: string, data: UpdateAppBodyType): Promise<any> {
    throw new Error('Function not implemented.');
  },
  setMoveAppId: function (value: React.SetStateAction<string | undefined>): void {
    throw new Error('Function not implemented.');
  },
  appType: 'all',
  refetchFolderDetail: async function (): Promise<AppDetailType | null> {
    throw new Error('Function not implemented.');
  },
  searchKey: '',
  setSearchKey: function (value: React.SetStateAction<string>): void {
    throw new Error('Function not implemented.');
  },
  listFilters: defaultAppListFilters,
  setListFilters: function (): void {
    throw new Error('Function not implemented.');
  },
  columnCount: 1,
  pageSize: 50
});

const AppListContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { parentId = null, type: queryType = 'all' } = router.query as {
    parentId?: string | null;
    type?: AppTypeEnum | 'all';
  };
  const [searchKey, setSearchKey] = useState('');
  const { userInfo } = useUserStore();
  const { isPc } = useSystem();
  const { feConfigs, setLastAppListRouteType } = useSystemStore();
  const listScene = getDashboardAppListScene(router.pathname);
  const isAgentPage = listScene === 'agent';
  const listFilterScene: AppListFilterScene | undefined =
    listScene === 'agent' || listScene === 'tool' ? listScene : undefined;
  const persistListFilters = !!listFilterScene;
  const teamId = userInfo?.team.teamId;
  const filterKey = persistListFilters && teamId ? buildFilterStorageKey({ teamId }) : '';
  const [filterStore, setFilterStore] = usePersistedFilters({
    key: filterKey,
    schema: AppListFiltersStoreSchema,
    defaultValue: defaultAppListFiltersStore
  });
  const listFilters =
    persistListFilters && listFilterScene ? filterStore[listFilterScene] : defaultAppListFilters;
  const setListFilters = useCallback(
    (next: AppListFilterType | ((prev: AppListFilterType) => AppListFilterType)) => {
      if (!listFilterScene) return;
      setFilterStore((prev) => ({
        ...prev,
        [listFilterScene]: typeof next === 'function' ? next(prev[listFilterScene]) : next
      }));
    },
    [listFilterScene, setFilterStore]
  );
  // Agent / Tool 读写同一份团队筛选的二级字段；聊天页继续读 URL type。
  // 移动端工具栏不展示类型/创建者/排序，请求也不能继续带持久化值，否则会出现看不见的空列表。
  const applyToolbarFilters = isPc && persistListFilters;
  const appType =
    persistListFilters && listFilterScene
      ? applyToolbarFilters
        ? resolveSceneListType(listFilters.type, listFilterScene)
        : 'all'
      : queryType;
  const sort = applyToolbarFilters ? listFilters.sort : undefined;
  const persistedTmbIds =
    applyToolbarFilters && feConfigs.isPlus ? toListTmbIds(listFilters.creator) : undefined;
  const { columnCount, pageSize } = useResponsiveGridPageSize(
    parentId ? { base: 1, sm: 2, md: 2, lg: 3 } : { base: 1, sm: 2, md: 2, lg: 3, xl: 4 }
  );

  const {
    data: myApps = [],
    isLoading: isFetchingApps,
    isEmpty,
    ScrollData,
    fetchData
  } = useScrollPagination(
    async ({ offset = 0, pageSize = 50 }) => {
      const formatType = resolveDashboardAppListTypes({
        pathname: router.pathname,
        type: appType
      });
      const fetchApps = (tmbIds?: string[]) =>
        getMyAppsV2(
          buildAppListRequest({
            parentId,
            type: formatType,
            searchKey,
            offset,
            pageSize: getGridRequestPageSize(pageSize, offset),
            sort,
            tmbIds
          })
        );

      return fetchApps(persistedTmbIds);
    },
    {
      refreshDeps: [
        searchKey,
        parentId,
        appType,
        sort,
        persistedTmbIds === undefined ? 'none' : persistedTmbIds.join(','),
        router.pathname,
        feConfigs.isPlus,
        isPc,
        pageSize
      ],
      pageSize,
      throttleWait: 500,
      refreshOnWindowFocus: true
    }
  );
  const loadMyApps = useCallback(() => fetchData({ init: true }), [fetchData]);

  const { data: paths = [], runAsync: refetchPaths } = useRequest(
    () => getAppFolderPath({ sourceId: parentId, type: 'current' }),
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const { data: folderDetail, runAsync: refetchFolderDetail } = useRequest(
    () => {
      if (parentId) return getAppDetailById(parentId);
      return Promise.resolve(null);
    },
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const { runAsync: onUpdateApp } = useRequest((id: string, data: UpdateAppBodyType) =>
    putAppById(id, data).then(async (res) => {
      await Promise.all([refetchFolderDetail(), refetchPaths(), loadMyApps()]);
      return res;
    })
  );

  const [moveAppId, setMoveAppId] = useState<string>();
  const onMoveApp = useCallback(
    async (parentId: ParentIdType) => {
      if (!moveAppId) return;
      await onUpdateApp(moveAppId, { parentId });
    },
    [moveAppId, onUpdateApp]
  );

  const getAppFolderList = useCallback<SelectOneResourceServer>(
    ({ parentId, offset, pageSize }, cancelToken) => {
      const folderType = isAgentPage ? AppTypeEnum.folder : AppTypeEnum.toolFolder;

      return getMyAppsV2(
        {
          parentId,
          type: folderType,
          offset,
          pageSize,
          excludeAppId: moveAppId
        },
        cancelToken
      ).then(({ list, total }) => ({
        total,
        list: list.map((item) => ({
          id: item._id,
          name: item.name,
          avatar: FolderImgUrl,
          isFolder: true,
          disabled: !item.permission.hasWritePer
        }))
      }));
    },
    [isAgentPage, moveAppId]
  );

  useEffect(() => {
    setLastAppListRouteType(appType);
  }, [appType, setLastAppListRouteType]);

  const contextValue: AppListContextType = {
    parentId,
    appType,
    myApps,
    loadMyApps,
    ScrollData,
    refetchFolderDetail,
    isFetchingApps,
    isEmpty,
    folderDetail,
    paths,
    onUpdateApp,
    setMoveAppId,
    searchKey,
    setSearchKey,
    listFilters,
    setListFilters,
    columnCount,
    pageSize
  };
  return (
    <AppListContext.Provider value={contextValue}>
      {children}
      {!!moveAppId && (
        <MoveModal
          moveResourceId={moveAppId}
          server={getAppFolderList}
          title={t('app:move_app')}
          onClose={() => setMoveAppId(undefined)}
          onConfirm={onMoveApp}
          moveHint={t('app:move.hint')}
        />
      )}
    </AppListContext.Provider>
  );
};

export default AppListContextProvider;
