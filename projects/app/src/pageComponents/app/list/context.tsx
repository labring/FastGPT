import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useRouter } from 'next/router';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getAppDetailById, getMyApps, putAppById } from '@/web/core/app/api';
import {
  AppDetailType,
  AppListItemType,
  AppTemplateSchemaType,
  TemplateTypeSchemaType
} from '@fastgpt/global/core/app/type';
import { getAppFolderPath } from '@/web/core/app/api/app';
import {
  GetResourceFolderListProps,
  ParentIdType,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { AppUpdateParams } from '@/global/core/app/api';
import dynamic from 'next/dynamic';
import { AppGroupEnum, AppTemplateTypeEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import { getPluginGroups, getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import { PluginGroupSchemaType } from '@fastgpt/service/core/app/plugin/type';
import { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { getTemplateMarketItemList, getTemplateTagList } from '@/web/core/app/api/template';
import { TemplateAppType } from './TemplateList';

const MoveModal = dynamic(() => import('@/components/common/folder/MoveModal'));

const recommendTag: TemplateTypeSchemaType = {
  typeId: AppTemplateTypeEnum.recommendation,
  typeName: i18nT('app:templateMarket.templateTags.Recommendation'),
  typeOrder: 0
};

type AppListContextType = {
  parentId?: string | null;
  appType: AppTypeEnum | 'all';
  myApps: AppListItemType[];
  loadMyApps: () => Promise<AppListItemType[]>;
  folderDetail: AppDetailType | undefined | null;
  paths: ParentTreePathItemType[];
  onUpdateApp: (id: string, data: AppUpdateParams) => Promise<any>;
  setMoveAppId: React.Dispatch<React.SetStateAction<string | undefined>>;
  refetchFolderDetail: () => Promise<AppDetailType | null>;
  searchKey: string;
  setSearchKey: React.Dispatch<React.SetStateAction<string>>;
  sidebarWidth: number;
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
  pluginGroups: PluginGroupSchemaType[];
  plugins: NodeTemplateListItemType[];
  templateTags: TemplateTypeSchemaType[];
  templateList: AppTemplateSchemaType[];
  currentAppType: TemplateAppType;
  setCurrentAppType: React.Dispatch<React.SetStateAction<TemplateAppType>>;
  isLoading: boolean;
};

export const AppListContext = createContext<AppListContextType>({
  parentId: undefined,
  myApps: [],
  loadMyApps: async function (): Promise<AppListItemType[]> {
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
  },
  sidebarWidth: 0,
  setSidebarWidth: function (value: React.SetStateAction<number>): void {
    throw new Error('Function not implemented.');
  },
  pluginGroups: [],
  plugins: [],
  templateTags: [],
  templateList: [],
  currentAppType: 'all',
  setCurrentAppType: function (value: React.SetStateAction<TemplateAppType>): void {
    throw new Error('Function not implemented.');
  },
  isLoading: false
});

const AppListContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const router = useRouter();

  const [searchKey, setSearchKey] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [currentAppType, setCurrentAppType] = useState<TemplateAppType>('all');

  const {
    selectedGroup,
    selectedType = 'all',
    parentId
  } = useMemo(() => {
    return {
      selectedGroup: router.pathname.split('/').pop(),
      selectedType: router.query.type as AppTypeEnum,
      parentId: router.query.parentId as string | null
    };
  }, [router.pathname, router.query.type, router.query.parentId]);

  const {
    data: myApps = [],
    runAsync: loadMyApps,
    loading: isFetchingApps
  } = useRequest2(
    () => {
      const formatType = (() => {
        if (!selectedType || selectedType === 'all') return undefined;
        if (selectedType === AppTypeEnum.plugin)
          return [AppTypeEnum.folder, AppTypeEnum.plugin, AppTypeEnum.httpPlugin];

        return [AppTypeEnum.folder, selectedType];
      })();
      return getMyApps({ parentId, type: formatType, searchKey });
    },
    {
      manual: selectedGroup !== AppGroupEnum.teamApps,
      refreshDeps: [searchKey, parentId, selectedType],
      throttleWait: 500
    }
  );

  const { data: pluginGroups = [], loading: isLoadingPluginGroups } = useRequest2(getPluginGroups, {
    manual: false
  });
  const { data: plugins = [], loading: isLoadingPlugins } = useRequest2(getSystemPlugTemplates, {
    manual:
      selectedGroup === AppGroupEnum.templateMarket || selectedGroup === AppGroupEnum.teamApps,
    refreshDeps: [selectedGroup]
  });

  const { data: templateTags = [], loading: isLoadingTags } = useRequest2(
    () => getTemplateTagList().then((res) => [recommendTag, ...res]),
    {
      manual: selectedGroup !== AppGroupEnum.templateMarket,
      refreshDeps: [selectedGroup]
    }
  );
  const { data: templateList = [], loading: isLoadingTemplates } = useRequest2(
    () => getTemplateMarketItemList({ type: currentAppType }),
    {
      manual: selectedGroup !== AppGroupEnum.templateMarket,
      refreshDeps: [selectedType, selectedGroup, currentAppType]
    }
  );

  const isLoading =
    isLoadingPluginGroups ||
    isLoadingPlugins ||
    isLoadingTags ||
    isLoadingTemplates ||
    isFetchingApps;

  const { data: paths = [], runAsync: refetchPaths } = useRequest2(
    () => getAppFolderPath({ sourceId: parentId, type: 'current' }),
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
    setLastAppListRouteType(selectedType);
  }, [setLastAppListRouteType, selectedType]);

  const contextValue: AppListContextType = {
    parentId,
    appType: selectedType,
    myApps,
    loadMyApps,
    refetchFolderDetail,
    folderDetail,
    paths,
    onUpdateApp,
    setMoveAppId,
    searchKey,
    setSearchKey,
    sidebarWidth,
    setSidebarWidth,
    pluginGroups,
    plugins,
    templateTags,
    templateList,
    isLoading,
    currentAppType,
    setCurrentAppType
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
