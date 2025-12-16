import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useMemo,
  useState
} from 'react';
import { createContext } from 'use-context-selector';
import { defaultApp } from '@/web/core/app/constants';
import { delAppById, getAppDetailById, putAppById } from '@/web/core/app/api';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { type AppChatConfigType, type AppDetailType } from '@fastgpt/global/core/app/type';
import { type AppUpdateParams, type PostPublishAppProps } from '@/global/core/app/api';
import { postPublishApp, getAppLatestVersion } from '@/web/core/app/api/version';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import dynamic from 'next/dynamic';
import { useDisclosure } from '@chakra-ui/react';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { AppTypeList } from '@fastgpt/global/core/app/constants';

const InfoModal = dynamic(() => import('./InfoModal'));
const TagsEditModal = dynamic(() => import('./TagsEditModal'));

export enum TabEnum {
  'appEdit' = 'appEdit',
  'publish' = 'publish',
  'logs' = 'logs'
}

type AppContextType = {
  appId: string;
  currentTab: TabEnum;
  route2Tab: (currentTab: TabEnum) => void;
  appDetail: AppDetailType;
  setAppDetail: Dispatch<SetStateAction<AppDetailType>>;
  loadingApp: boolean;
  updateAppDetail: (data: AppUpdateParams) => Promise<void>;
  onOpenInfoEdit: () => void;
  onOpenTeamTagModal: () => void;
  onDelApp: () => void;
  onSaveApp: (data: PostPublishAppProps) => Promise<void>;
  appLatestVersion:
    | {
        nodes: StoreNodeItemType[];
        edges: StoreEdgeItemType[];
        chatConfig: AppChatConfigType;
      }
    | undefined;
  reloadAppLatestVersion: () => void;
  reloadApp: () => void;
};

export const AppContext = createContext<AppContextType>({
  appId: '',
  currentTab: TabEnum.appEdit,
  route2Tab: function (currentTab: TabEnum): void {
    throw new Error('Function not implemented.');
  },
  appDetail: defaultApp,
  loadingApp: false,
  updateAppDetail: function (data: AppUpdateParams): Promise<void> {
    throw new Error('Function not implemented.');
  },
  setAppDetail: function (value: SetStateAction<AppDetailType>): void {
    throw new Error('Function not implemented.');
  },
  onOpenInfoEdit: function (): void {
    throw new Error('Function not implemented.');
  },
  onOpenTeamTagModal: function (): void {
    throw new Error('Function not implemented.');
  },
  onDelApp: function (): void {
    throw new Error('Function not implemented.');
  },
  onSaveApp: function (data: PostPublishAppProps): Promise<void> {
    throw new Error('Function not implemented.');
  },
  appLatestVersion: undefined,
  reloadAppLatestVersion: function (): void {
    throw new Error('Function not implemented.');
  },
  reloadApp: function (): void {
    throw new Error('Function not implemented.');
  }
});

const AppContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { appId, currentTab = TabEnum.appEdit } = router.query as {
    appId: string;
    currentTab: TabEnum;
  };

  const {
    isOpen: isOpenInfoEdit,
    onOpen: onOpenInfoEdit,
    onClose: onCloseInfoEdit
  } = useDisclosure();
  const {
    isOpen: isOpenTeamTagModal,
    onOpen: onOpenTeamTagModal,
    onClose: onCloseTeamTagModal
  } = useDisclosure();

  const route2Tab = useCallback(
    (currentTab: `${TabEnum}`) => {
      router.push({
        query: {
          ...router.query,
          currentTab
        }
      });
    },
    [router]
  );

  const [appDetail, setAppDetail] = useState<AppDetailType>(defaultApp);
  const { loading: loadingApp, runAsync: reloadApp } = useRequest2(
    () => {
      if (appId) {
        return getAppDetailById(appId);
      }
      return Promise.resolve(defaultApp);
    },
    {
      manual: false,
      refreshDeps: [appId],
      errorToast: t('common:core.app.error.Get app failed'),
      onError(err: any) {
        router.replace('/dashboard/agent');
      },
      onSuccess(res) {
        setAppDetail(res);
      }
    }
  );

  const { data: appLatestVersion, run: reloadAppLatestVersion } = useRequest2(
    () => getAppLatestVersion({ appId }),
    {
      manual: !appDetail?.permission?.hasWritePer,
      refreshDeps: [appDetail?.permission?.hasWritePer]
    }
  );

  const { runAsync: updateAppDetail } = useRequest2(async (data: AppUpdateParams) => {
    await putAppById(appId, data);
    setAppDetail((state) => ({
      ...state,
      ...data,
      modules: data.nodes || state.modules
    }));
  });

  const { runAsync: onSaveApp } = useRequest2(
    async (data: PostPublishAppProps) => {
      try {
        if (!appDetail.permission.hasWritePer) return;
        await postPublishApp(appId, data);
        setAppDetail((state) => ({
          ...state,
          ...data,
          modules: data.nodes || state.modules
        }));
        reloadAppLatestVersion();
      } catch (error: any) {
        if (error.statusText == AppErrEnum.unExist) {
          return;
        }
        return Promise.reject(error);
      }
    },
    {
      manual: true,
      refreshDeps: [appDetail.permission.hasWritePer, appId]
    }
  );

  const isAgent = AppTypeList.includes(appDetail.type);
  const { openConfirm: openConfirmDel, ConfirmModal: ConfirmDelModal } = useConfirm({
    type: 'delete',
    content: isAgent ? t('app:confirm_del_app_tip') : t('app:confirm_del_tool_tip')
  });
  const { runAsync: deleteApp } = useRequest2(
    async () => {
      if (!appDetail) return Promise.reject('Not load app');
      return delAppById(appDetail._id);
    },
    {
      onSuccess(data) {
        data.forEach((appId) => {
          localStorage.removeItem(`app_log_keys_${appId}`);
        });

        router.replace(isAgent ? `/dashboard/agent` : `/dashboard/tool`);
      },
      successToast: t('common:delete_success'),
      errorToast: t('common:delete_failed')
    }
  );
  const onDelApp = useCallback(
    () =>
      openConfirmDel({
        onConfirm: deleteApp,
        inputConfirmText: appDetail.name
      })(),
    [deleteApp, openConfirmDel, appDetail.name]
  );

  const contextValue: AppContextType = useMemo(
    () => ({
      appId,
      currentTab,
      route2Tab,
      appDetail,
      setAppDetail,
      loadingApp,
      updateAppDetail,
      onOpenInfoEdit,
      onOpenTeamTagModal,
      onDelApp,
      onSaveApp,
      appLatestVersion,
      reloadAppLatestVersion,
      reloadApp
    }),
    [
      appDetail,
      appId,
      appLatestVersion,
      currentTab,
      loadingApp,
      onDelApp,
      onOpenInfoEdit,
      onOpenTeamTagModal,
      onSaveApp,
      reloadApp,
      reloadAppLatestVersion,
      route2Tab,
      updateAppDetail
    ]
  );

  return (
    <AppContext.Provider value={contextValue}>
      {children}
      {isOpenInfoEdit && <InfoModal onClose={onCloseInfoEdit} />}
      {isOpenTeamTagModal && <TagsEditModal onClose={onCloseTeamTagModal} />}

      <ConfirmDelModal />
    </AppContext.Provider>
  );
};

export default AppContextProvider;
