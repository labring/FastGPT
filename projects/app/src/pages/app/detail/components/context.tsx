import { Dispatch, ReactNode, SetStateAction, useCallback, useMemo, useState } from 'react';
import { createContext } from 'use-context-selector';
import { defaultApp } from '@/web/core/app/constants';
import { delAppById, getAppDetailById, putAppById } from '@/web/core/app/api';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { AppChatConfigType, AppDetailType } from '@fastgpt/global/core/app/type';
import { AppUpdateParams, PostPublishAppProps } from '@/global/core/app/api';
import { postPublishApp, getAppLatestVersion } from '@/web/core/app/api/version';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import dynamic from 'next/dynamic';
import { useDisclosure } from '@chakra-ui/react';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';

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
        router.replace('/app/list');
      },
      onSuccess(res) {
        setAppDetail(res);
      }
    }
  );

  const { data: appLatestVersion, run: reloadAppLatestVersion } = useRequest2(
    () => getAppLatestVersion({ appId }),
    {
      manual: false
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

  const { runAsync: onSaveApp } = useRequest2(async (data: PostPublishAppProps) => {
    await postPublishApp(appId, data);
    setAppDetail((state) => ({
      ...state,
      ...data,
      modules: data.nodes || state.modules
    }));
    reloadAppLatestVersion();
  });

  const { openConfirm: openConfirmDel, ConfirmModal: ConfirmDelModal } = useConfirm({
    content: t('app:confirm_del_app_tip', { name: appDetail.name }),
    type: 'delete'
  });
  const { runAsync: deleteApp } = useRequest2(
    async () => {
      if (!appDetail) return Promise.reject('Not load app');
      return delAppById(appDetail._id);
    },
    {
      onSuccess() {
        router.replace(`/app/list`);
      },
      successToast: t('common:common.Delete Success'),
      errorToast: t('common:common.Delete Failed')
    }
  );
  const onDelApp = useCallback(
    () =>
      openConfirmDel(
        deleteApp,
        undefined,
        t('app:confirm_del_app_tip', { name: appDetail.name })
      )(),
    [appDetail.name, deleteApp, openConfirmDel, t]
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
