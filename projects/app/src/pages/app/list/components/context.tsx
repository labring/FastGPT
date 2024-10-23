import React, { ReactNode, useCallback, useEffect, useState } from 'react';
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
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
const MoveModal = dynamic(() => import('@/components/common/folder/MoveModal'));

type AppListContextType = {
  parentId?: string | null;
  appType: AppTypeEnum | 'ALL';
  myApps: AppListItemType[];
  loadMyApps: () => Promise<AppListItemType[]>;
  isFetchingApps: boolean;
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
  loadMyApps: async function (): Promise<AppListItemType[]> {
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
  appType: 'ALL',
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
  const { parentId = null, type = 'ALL' } = router.query as {
    parentId?: string | null;
    type: AppTypeEnum;
  };
  const [searchKey, setSearchKey] = useState('');

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
      return getMyApps({ parentId, type: formatType, searchKey });
    },
    {
      manual: false,
      refreshDeps: [searchKey, parentId, type],
      throttleWait: 500,
      refreshOnWindowFocus: true
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
      res
        .filter((item) => item.permission.hasWritePer)
        .map((item) => ({
          id: item._id,
          name: item.name
        }))
    );
  }, []);

  const { setLastAppListRouteType } = useSystemStore();
  useEffect(() => {
    setLastAppListRouteType(type);
  }, [setLastAppListRouteType, type]);

  const contextValue: AppListContextType = {
    parentId,
    appType: type,
    myApps: data,
    loadMyApps,
    refetchFolderDetail,
    isFetchingApps,
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
