import React, { ReactNode, useCallback, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useRouter } from 'next/router';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getAppDetailById, getMyApps, putAppById } from '@/web/core/app/api';
import { AppDetailType, AppListItemType } from '@fastgpt/global/core/app/type';
import { getAppFolderPath } from '@/web/core/app/api/app';
import {
  GetResourceFolderListProps,
  ParentIdType,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { AppUpdateParams } from '@/global/core/app/api';
import dynamic from 'next/dynamic';
import { useI18n } from '@/web/context/I18n';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
const MoveModal = dynamic(() => import('@/components/common/folder/MoveModal'));

type AppListContextType = {
  parentId?: string | null;
  appType: AppTypeEnum | 'ALL';
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
  },
  appType: 'ALL'
});

const AppListContextProvider = ({ children }: { children: ReactNode }) => {
  const { appT } = useI18n();
  const router = useRouter();
  const { parentId = null, type = 'ALL' } = router.query as {
    parentId?: string | null;
    type: AppTypeEnum;
  };

  const {
    data = [],
    runAsync: loadMyApps,
    loading: isFetchingApps
  } = useRequest2(
    () => {
      const formatType = (() => {
        if (!type || type === 'ALL') return undefined;
        if (type === AppTypeEnum.plugin)
          return [AppTypeEnum.folder, AppTypeEnum.plugin, AppTypeEnum.httpPlugin];

        return [AppTypeEnum.folder, type];
      })();

      return getMyApps({ parentId, type: formatType });
    },
    {
      manual: false,
      refreshOnWindowFocus: true,
      refreshDeps: [parentId, type]
    }
  );

  const { data: paths = [], runAsync: refetchPaths } = useRequest2(
    () => getAppFolderPath(parentId),
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const { data: folderDetail, runAsync: refetchFolderDetail } = useRequest2(
    () => {
      if (parentId) return getAppDetailById(parentId);
      return Promise.resolve(null);
    },
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const { runAsync: onUpdateApp } = useRequest2((id: string, data: AppUpdateParams) =>
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

  const getAppFolderList = useCallback(({ parentId }: GetResourceFolderListProps) => {
    return getMyApps({
      parentId,
      type: AppTypeEnum.folder
    }).then((res) =>
      res.map((item) => ({
        id: item._id,
        name: item.name
      }))
    );
  }, []);

  const contextValue: AppListContextType = {
    parentId,
    appType: type,
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

export default AppListContextProvider;
