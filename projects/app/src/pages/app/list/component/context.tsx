import React, { ReactNode, useCallback, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useRouter } from 'next/router';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getAppDetailById, getMyApps, putAppById } from '@/web/core/app/api';
import { AppDetailType, AppListItemType } from '@fastgpt/global/core/app/type';
import { useQuery } from '@tanstack/react-query';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { ParentIdType, ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { AppUpdateParams } from '@/global/core/app/api';
import dynamic from 'next/dynamic';
import { getAppFolderList } from '@/web/core/app/api/app';
import { useI18n } from '@/web/context/I18n';

type AppListContextType = {
  parentId?: string | null;
  myApps: AppListItemType[];
  loadMyApps: () => void;
  isFetchingApps: boolean;
  folderDetail: AppDetailType | undefined | null;
  paths: ParentTreePathItemType[];
  onUpdateApp: (id: string, data: AppUpdateParams) => Promise<any>;
  setMoveAppId: React.Dispatch<React.SetStateAction<string | undefined>>;
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
  onUpdateApp: function (id: string, data: AppUpdateParams): Promise<any> {
    throw new Error('Function not implemented.');
  },
  setMoveAppId: function (value: React.SetStateAction<string | undefined>): void {
    throw new Error('Function not implemented.');
  }
});

const MoveModal = dynamic(() => import('@/components/common/folder/MoveModal'));

export const AppListContextProvider = ({ children }: { children: ReactNode }) => {
  const { appT } = useI18n();
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
      return null;
    }
  );
  const { runAsync: onUpdateApp } = useRequest2(putAppById, {
    onSuccess() {
      refetchFolderDetail();
      refetchPaths();
      loadMyApps();
    }
  });

  const [moveAppId, setMoveAppId] = useState<string>();
  const onMoveApp = useCallback(
    async (parentId: ParentIdType) => {
      if (!moveAppId) return;
      await onUpdateApp(moveAppId, { parentId });
    },
    [moveAppId, onUpdateApp]
  );

  const contextValue: AppListContextType = {
    parentId,
    myApps: data,
    loadMyApps,
    isFetchingApps,
    folderDetail,
    paths,
    onUpdateApp,
    setMoveAppId
  };
  return (
    <AppListContext.Provider value={contextValue}>
      {children}
      {!!moveAppId && (
        <MoveModal
          moveResourceId={moveAppId}
          server={getAppFolderList}
          title={appT('Move app')}
          onClose={() => setMoveAppId(undefined)}
          onConfirm={onMoveApp}
        />
      )}
    </AppListContext.Provider>
  );
};
