import React, { ReactNode } from 'react';
import { createContext } from 'use-context-selector';
import { useRouter } from 'next/router';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getAppDetailById, getMyApps, putAppById } from '@/web/core/app/api';
import { AppDetailType, AppListItemType } from '@fastgpt/global/core/app/type';
import { useQuery } from '@tanstack/react-query';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { AppUpdateParams } from '@/global/core/app/api';

type AppListContextType = {
  parentId?: string | null;
  myApps: AppListItemType[];
  loadMyApps: () => void;
  isFetchingApps: boolean;
  folderDetail: AppDetailType | undefined;
  paths: ParentTreePathItemType[];
  onUpdateApp: (id: string, data: AppUpdateParams) => void;
};

export const AppListContext = createContext<AppListContextType>({
  parentId: undefined,
  myApps: [],
  loadMyApps: function (): void {
    throw new Error('Function not implemented.');
  },
  isFetchingApps: false,
  folderDetail: undefined,
  paths: [],
  onUpdateApp: function (id: string, data: AppUpdateParams): void {
    throw new Error('Function not implemented.');
  }
});

export const AppListContextProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const { parentId = null } = router.query as { parentId?: string | null };

  const {
    data = [],
    run: loadMyApps,
    loading: isFetchingApps
  } = useRequest2(() => getMyApps({ parentId }), {
    manual: false,
    refreshOnWindowFocus: true,
    refreshDeps: [parentId]
  });

  const { data: paths = [], refetch: refetchPaths } = useQuery(['getPaths', parentId], () =>
    getAppFolderPath(parentId)
  );

  const { data: folderDetail, refetch: refetchFolderDetail } = useQuery(
    ['getFolderDetail', parentId],
    () => {
      if (parentId) return getAppDetailById(parentId);
      return;
    }
  );
  const { runAsync: onUpdateApp } = useRequest2(putAppById, {
    onSuccess() {
      refetchFolderDetail();
      refetchPaths();
      loadMyApps();
    }
  });

  const contextValue: AppListContextType = {
    parentId,
    myApps: data,
    loadMyApps,
    isFetchingApps,
    folderDetail,
    paths,
    onUpdateApp
  };
  return <AppListContext.Provider value={contextValue}>{children}</AppListContext.Provider>;
};
