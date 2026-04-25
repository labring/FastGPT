import React, { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useRouter } from 'next/router';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getAppDetailById, getMyApps, getMyAppsPaginated, putAppById } from '@/web/core/app/api';
import { type AppDetailType, type AppListItemType } from '@fastgpt/global/core/app/type';
import { useInfiniteScroll } from '@fastgpt/web/hooks/useInfiniteScroll';
import { getAppFolderPath } from '@/web/core/app/api/app';
import {
  type GetResourceFolderListProps,
  type ParentIdType,
  type ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { type AppUpdateParams } from '@/global/core/app/api';
import dynamic from 'next/dynamic';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import { useDebounce } from 'ahooks';
const MoveModal = dynamic(() => import('@/components/common/folder/MoveModal'));

type AppListContextType = {
  parentId?: string | null;
  appType: AppTypeEnum | 'all';
  myApps: AppListItemType[];
  /** 重置并重新从第 1 页加载 */
  loadMyApps: () => Promise<void>;
  isFetchingApps: boolean;
  /** 是否还有更多数据可加载 */
  hasMore: boolean;
  /** 提供给哨兵元素的 callback ref（由 useInfiniteScroll 内部驱动 Observer） */
  sentinelCallbackRef: (el: HTMLDivElement | null) => void;
  folderDetail: AppDetailType | undefined | null;
  paths: ParentTreePathItemType[];
  onUpdateApp: (id: string, data: AppUpdateParams) => Promise<any>;
  setMoveAppId: React.Dispatch<React.SetStateAction<string | undefined>>;
  refetchFolderDetail: () => Promise<AppDetailType | null>;
  searchKey: string;
  setSearchKey: React.Dispatch<React.SetStateAction<string>>;
};

export const AppListContext = createContext<AppListContextType>({
  parentId: undefined,
  myApps: [],
  loadMyApps: async function (): Promise<void> {
    throw new Error('Function not implemented.');
  },
  isFetchingApps: false,
  hasMore: false,
  sentinelCallbackRef: function (): void {
    throw new Error('Function not implemented.');
  },
  folderDetail: undefined,
  paths: [],
  onUpdateApp: function (id: string, data: AppUpdateParams): Promise<any> {
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
  }
});

const AppListContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { parentId = null, type = 'all' } = router.query as {
    parentId?: string | null;
    type: AppTypeEnum;
  };
  const [searchKey, setSearchKey] = useState('');
  // 对搜索词防抖，避免输入时频繁请求
  const debouncedSearchKey = useDebounce(searchKey, { wait: 500 });

  // 计算当前路由对应的 App 类型过滤
  const formatType = useMemo(() => {
    if (router.pathname.includes('/chat')) {
      return [
        AppTypeEnum.folder,
        AppTypeEnum.toolFolder,
        AppTypeEnum.simple,
        AppTypeEnum.workflow,
        AppTypeEnum.workflowTool,
        AppTypeEnum.chatAgent
      ];
    }
    if (router.pathname.includes('/agent')) {
      return !type || type === 'all'
        ? [
            AppTypeEnum.folder,
            AppTypeEnum.simple,
            AppTypeEnum.workflow,
            AppTypeEnum.chatAgent,
            AppTypeEnum.assistant
          ]
        : [AppTypeEnum.folder, type];
    }
    return !type || type === 'all'
      ? [
          AppTypeEnum.toolFolder,
          AppTypeEnum.workflowTool,
          AppTypeEnum.mcpToolSet,
          AppTypeEnum.httpToolSet
        ]
      : [AppTypeEnum.toolFolder, type];
  }, [router.pathname, type]);

  // ---------- 无限滚动分页（useInfiniteScroll hook） ----------
  const fetcher = useCallback(
    (params: { pageNum: number; pageSize: number }) =>
      getMyAppsPaginated({
        ...params,
        parentId,
        type: formatType,
        searchKey: debouncedSearchKey
      }),
    [parentId, formatType, debouncedSearchKey]
  );

  const {
    list: myApps,
    isLoading: isFetchingApps,
    hasMore,
    refresh: loadMyApps,
    sentinelCallbackRef
  } = useInfiniteScroll<AppListItemType>(fetcher);

  // ---------- 其余原有逻辑保持不变 ----------

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

  const { runAsync: onUpdateApp } = useRequest((id: string, data: AppUpdateParams) =>
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

  const getAppFolderList = useCallback(
    ({ parentId }: GetResourceFolderListProps) => {
      const isAgent = router.pathname.includes('/agent');
      const folderType = isAgent ? AppTypeEnum.folder : AppTypeEnum.toolFolder;

      return getMyApps({
        parentId,
        type: folderType
      }).then((res) =>
        res
          .filter((item) => item.permission.hasWritePer)
          .map((item) => ({
            id: item._id,
            name: item.name
          }))
      );
    },
    [router.pathname]
  );

  const { setLastAppListRouteType } = useSystemStore();
  useEffect(() => {
    setLastAppListRouteType(type);
  }, [setLastAppListRouteType, type]);

  const contextValue: AppListContextType = {
    parentId,
    appType: type,
    myApps,
    loadMyApps,
    refetchFolderDetail,
    isFetchingApps,
    hasMore,
    sentinelCallbackRef,
    folderDetail,
    paths,
    onUpdateApp,
    setMoveAppId,
    searchKey,
    setSearchKey
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
