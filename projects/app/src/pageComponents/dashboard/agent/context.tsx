import React, { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
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
const BatchActionBar = dynamic(() => import('./BatchActionBar'));
const BatchDeleteModal = dynamic(() => import('./BatchDeleteModal'));

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

  // 批量管理状态与方法
  isBatchMode: boolean;
  setIsBatchMode: React.Dispatch<React.SetStateAction<boolean>>;
  selectedAppIds: string[];
  setSelectedAppIds: React.Dispatch<React.SetStateAction<string[]>>;
  onToggleSelectApp: (id: string) => void;
  onSelectAllApps: (checked: boolean) => void;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  selectableApps: AppListItemType[];
  selectedApps: AppListItemType[];
  isBatchMoving: boolean;
  setIsBatchMoving: React.Dispatch<React.SetStateAction<boolean>>;
  isBatchDeleting: boolean;
  setIsBatchDeleting: React.Dispatch<React.SetStateAction<boolean>>;
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
  onUpdateApp: function (_id: string, _data: UpdateAppBodyType): Promise<any> {
    throw new Error('Function not implemented.');
  },
  setMoveAppId: function (_value: React.SetStateAction<string | undefined>): void {
    throw new Error('Function not implemented.');
  },
  appType: 'all',
  refetchFolderDetail: async function (): Promise<AppDetailType | null> {
    throw new Error('Function not implemented.');
  },
  searchKey: '',
  setSearchKey: function (_value: React.SetStateAction<string>): void {
    throw new Error('Function not implemented.');
  },
  listFilters: defaultAppListFilters,
  setListFilters: function (): void {
    throw new Error('Function not implemented.');
  },
  columnCount: 1,
  pageSize: 50,

  isBatchMode: false,
  setIsBatchMode: function (): void {
    throw new Error('Function not implemented.');
  },
  selectedAppIds: [],
  setSelectedAppIds: function (): void {
    throw new Error('Function not implemented.');
  },
  onToggleSelectApp: function (): void {
    throw new Error('Function not implemented.');
  },
  onSelectAllApps: function (): void {
    throw new Error('Function not implemented.');
  },
  isAllSelected: false,
  isIndeterminate: false,
  selectableApps: [],
  selectedApps: [],
  isBatchMoving: false,
  setIsBatchMoving: function (): void {
    throw new Error('Function not implemented.');
  },
  isBatchDeleting: false,
  setIsBatchDeleting: function (): void {
    throw new Error('Function not implemented.');
  }
});

const AppListContextProvider = ({
  children,
  showPaginationTip = true
}: {
  children: ReactNode;
  showPaginationTip?: boolean;
}) => {
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
      showPaginationTip
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

  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);
  const [isBatchMoving, setIsBatchMoving] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // 在渲染阶段同步校准状态：当离开批量模式，或目录、搜索、筛选发生变化时立即清空已选项，避免 effect 异步级联渲染与状态错乱
  const [prevBatchState, setPrevBatchState] = useState({
    parentId,
    searchKey,
    listFilters,
    isBatchMode
  });

  if (
    prevBatchState.parentId !== parentId ||
    prevBatchState.searchKey !== searchKey ||
    prevBatchState.listFilters !== listFilters ||
    prevBatchState.isBatchMode !== isBatchMode
  ) {
    setPrevBatchState({
      parentId,
      searchKey,
      listFilters,
      isBatchMode
    });
    if (selectedAppIds.length > 0) {
      setSelectedAppIds([]);
    }
  }

  const handleSetIsBatchMode = useCallback((action: React.SetStateAction<boolean>) => {
    setIsBatchMode((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (!next) {
        setSelectedAppIds([]);
      }
      return next;
    });
  }, []);

  // 可批量操作的资源（必须具有管理权限或为 Owner）
  const selectableApps = useMemo(
    () => myApps.filter((app) => Boolean(app.permission?.hasManagePer || app.permission?.isOwner)),
    [myApps]
  );
  const selectableAppIds = useMemo(() => selectableApps.map((a) => a._id), [selectableApps]);

  const selectedApps = useMemo(
    () => myApps.filter((app) => selectedAppIds.includes(app._id)),
    [myApps, selectedAppIds]
  );

  const isAllSelected = useMemo(
    () =>
      selectableAppIds.length > 0 && selectableAppIds.every((id) => selectedAppIds.includes(id)),
    [selectableAppIds, selectedAppIds]
  );

  const isIndeterminate = useMemo(
    () => selectedAppIds.length > 0 && !isAllSelected,
    [selectedAppIds, isAllSelected]
  );

  const onToggleSelectApp = useCallback(
    (id: string) => {
      if (!selectableAppIds.includes(id)) return;
      setSelectedAppIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    },
    [selectableAppIds]
  );

  const onSelectAllApps = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedAppIds(selectableAppIds);
      } else {
        setSelectedAppIds([]);
      }
    },
    [selectableAppIds]
  );

  const onBatchMoveApps = useCallback(
    async (targetParentId: ParentIdType) => {
      if (selectedAppIds.length === 0) return;
      await Promise.all(selectedAppIds.map((id) => putAppById(id, { parentId: targetParentId })));
      await Promise.all([refetchFolderDetail(), refetchPaths(), loadMyApps()]);
      setSelectedAppIds([]);
      setIsBatchMode(false);
    },
    [selectedAppIds, refetchFolderDetail, refetchPaths, loadMyApps]
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
    pageSize,

    isBatchMode,
    setIsBatchMode: handleSetIsBatchMode,
    selectedAppIds,
    setSelectedAppIds,
    onToggleSelectApp,
    onSelectAllApps,
    isAllSelected,
    isIndeterminate,
    selectableApps,
    selectedApps,
    isBatchMoving,
    setIsBatchMoving,
    isBatchDeleting,
    setIsBatchDeleting
  };
  return (
    <AppListContext.Provider value={contextValue}>
      {children}
      {isBatchMode && isPc && <BatchActionBar />}
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
      {isBatchMoving && (
        <MoveModal
          moveResourceIds={selectedAppIds}
          server={getAppFolderList}
          title={t('app:move_app')}
          onClose={() => setIsBatchMoving(false)}
          onConfirm={onBatchMoveApps}
          moveHint={t('app:move.hint')}
        />
      )}
      {isBatchDeleting && selectedApps.length > 0 && (
        <BatchDeleteModal
          apps={selectedApps}
          onClose={() => setIsBatchDeleting(false)}
          onSuccess={() => {
            setSelectedAppIds([]);
            loadMyApps();
          }}
        />
      )}
    </AppListContext.Provider>
  );
};

export default AppListContextProvider;
