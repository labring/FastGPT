import React, {
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useMemoizedFn } from 'ahooks';
import { createContext } from 'use-context-selector';
import { defaultApp } from '@/web/core/app/constants';
import { delAppById, getAppDetailById, putAppById } from '@/web/core/app/api';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { type AppChatConfigType, type AppDetailType } from '@fastgpt/global/core/app/type';
import { type PostPublishAppProps } from '@/global/core/app/api';
import { type UpdateAppBodyType } from '@fastgpt/global/openapi/core/app/common/api';
import { postPublishApp, getAppLatestVersion } from '@/web/core/app/api/version';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import dynamic from 'next/dynamic';
import { useDisclosure } from '@chakra-ui/react';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { AppTypeList } from '@fastgpt/global/core/app/constants';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { hasDebugToolInNodes } from '@fastgpt/global/core/app/tool/utils';
import { ToastHandledError } from '@fastgpt/global/common/error/utils';
import type { WorkflowSaveRequest } from '@/web/core/workflow/editor/session/workflowPersistence';

const InfoModal = dynamic(() => import('./InfoModal'));
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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
  updateAppDetail: (data: UpdateAppBodyType) => Promise<void>;
  onOpenInfoEdit: () => void;
  onDelApp: () => void;
  onSaveApp: AppSaveHandler;
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

type SaveAppParams = {
  data: PostPublishAppProps;
  request?: WorkflowSaveRequest;
  saveToken: number;
};

type QueuedSaveApp = SaveAppParams & {
  appId: string;
  resolve: (saved: boolean) => void;
  reject: (error: unknown) => void;
};

/** 保存单飞：在飞请求结束后只启动当前 pending，旧 pending 立即返回 false。 */
const runQueuedSave = ({
  save,
  saveApp,
  currentAppIdRef,
  saveInFlightRef,
  pendingSaveRef
}: {
  save: QueuedSaveApp;
  saveApp: (params: SaveAppParams) => Promise<boolean>;
  currentAppIdRef: MutableRefObject<string>;
  saveInFlightRef: MutableRefObject<boolean>;
  pendingSaveRef: MutableRefObject<QueuedSaveApp | undefined>;
}) => {
  saveInFlightRef.current = true;
  let savePromise: Promise<boolean>;
  try {
    savePromise = save.appId === currentAppIdRef.current ? saveApp(save) : Promise.resolve(false);
  } catch (error) {
    savePromise = Promise.reject(error);
  }

  void savePromise.then(save.resolve, save.reject).finally(() => {
    saveInFlightRef.current = false;
    const nextSave = pendingSaveRef.current;
    pendingSaveRef.current = undefined;
    if (nextSave) {
      runQueuedSave({
        save: nextSave,
        saveApp,
        currentAppIdRef,
        saveInFlightRef,
        pendingSaveRef
      });
    }
  });
};

export type AppSaveHandler = (
  data: PostPublishAppProps,
  request?: WorkflowSaveRequest
) => Promise<boolean>;

export const AppContext = createContext<AppContextType>({
  appId: '',
  currentTab: TabEnum.appEdit,
  route2Tab: function (_currentTab: TabEnum): void {
    throw new Error('Function not implemented.');
  },
  appDetail: defaultApp,
  loadingApp: false,
  updateAppDetail: function (_data: UpdateAppBodyType): Promise<void> {
    throw new Error('Function not implemented.');
  },
  setAppDetail: function (_value: SetStateAction<AppDetailType>): void {
    throw new Error('Function not implemented.');
  },
  onOpenInfoEdit: function (): void {
    throw new Error('Function not implemented.');
  },
  onDelApp: function (): void {
    throw new Error('Function not implemented.');
  },
  onSaveApp: (_data: PostPublishAppProps, _request?: WorkflowSaveRequest) => {
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
  const currentAppIdRef = useRef(appId);
  const saveTokenRef = useRef(0);
  const latestSaveRequestRef = useRef<WorkflowSaveRequest>();
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<QueuedSaveApp>();

  // layout effect 在客户端提交后立即切换身份，旧 app 响应无法穿过该窗口回写。
  useBrowserLayoutEffect(() => {
    const previousAppId = currentAppIdRef.current;
    currentAppIdRef.current = appId;
    if (previousAppId === appId) return;

    saveTokenRef.current += 1;
    latestSaveRequestRef.current = undefined;
    pendingSaveRef.current?.resolve(false);
    pendingSaveRef.current = undefined;
  }, [appId]);

  useEffect(() => {
    return () => {
      saveTokenRef.current += 1;
      latestSaveRequestRef.current = undefined;
      pendingSaveRef.current?.resolve(false);
      pendingSaveRef.current = undefined;
    };
  }, []);

  const {
    isOpen: isOpenInfoEdit,
    onOpen: onOpenInfoEdit,
    onClose: onCloseInfoEdit
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
  const { loading: loadingApp, runAsync: reloadApp } = useRequest(
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
      onError(_err: any) {
        router.replace('/dashboard/agent');
      },
      onSuccess(res) {
        setAppDetail(res);
      }
    }
  );

  const { data: appLatestVersion, run: reloadAppLatestVersion } = useRequest(
    () => getAppLatestVersion({ appId }),
    {
      manual: !appDetail?.permission?.hasWritePer,
      refreshDeps: [appDetail?.permission?.hasWritePer]
    }
  );

  const { runAsync: updateAppDetail } = useRequest(async (data: UpdateAppBodyType) => {
    await putAppById(appId, data);
    const { avatar, intro, ...rest } = data;
    setAppDetail((state) => ({
      ...state,
      ...rest,
      ...(avatar !== undefined && { avatar: avatar ?? '' }),
      ...(intro !== undefined && { intro: intro ?? '' })
    }));
  });

  const { runAsync: saveApp } = useRequest(
    async ({ data, request, saveToken }: SaveAppParams) => {
      const isCurrentSave = () =>
        saveToken === saveTokenRef.current &&
        currentAppIdRef.current === appId &&
        (!request || latestSaveRequestRef.current === request);

      if (request && request.appId !== appId) return false;
      if (!appDetail.permission.hasWritePer) return false;

      try {
        if (data.isPublish && hasDebugToolInNodes(data.nodes)) {
          toast({
            title: t('app:publish_remove_debug_tool_tip'),
            status: 'warning'
          });
          return Promise.reject(new ToastHandledError('Debug tool cannot be published'));
        }
        await postPublishApp(appId, data);
        if (!isCurrentSave()) return false;
        setAppDetail((state) => ({
          ...state,
          ...data,
          modules: data.nodes || state.modules
        }));
        reloadAppLatestVersion();
        return true;
      } catch (error: any) {
        if (!isCurrentSave()) return false;
        if (error.statusText === AppErrEnum.unExist) {
          router.replace('/dashboard/agent');
          return false;
        }
        return Promise.reject(error);
      }
    },
    {
      manual: true,
      // 保存入口通常会再包一层 useRequest 处理按钮 loading 和 toast，这里只做共享保存动作，避免失败时重复提示。
      errorToast: '',
      refreshDeps: [appDetail.permission.hasWritePer, appId]
    }
  );

  const saveAppFn = useMemoizedFn(saveApp);

  const onSaveApp = useCallback(
    (data: PostPublishAppProps, request?: WorkflowSaveRequest) => {
      const saveToken = ++saveTokenRef.current;
      latestSaveRequestRef.current = request;
      return new Promise<boolean>((resolve, reject) => {
        const save = { appId, data, request, saveToken, resolve, reject };
        if (saveInFlightRef.current) {
          pendingSaveRef.current?.resolve(false);
          pendingSaveRef.current = save;
          return;
        }
        runQueuedSave({
          save,
          saveApp: saveAppFn,
          currentAppIdRef,
          saveInFlightRef,
          pendingSaveRef
        });
      });
    },
    [appId, saveAppFn]
  );

  const isAgent = AppTypeList.includes(appDetail.type);
  const { openConfirm, ConfirmModal } = useConfirm();
  const { runAsync: deleteApp } = useRequest(
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
  const onDelApp = useCallback(() => {
    openConfirm({
      title: t('common:delete_warning'),
      customContent: isAgent ? t('app:confirm_del_app_tip') : t('app:confirm_del_tool_tip'),
      onConfirm: deleteApp,
      confirmButtonVariant: 'dangerFill',
      inputConfirmText: appDetail.name
    })();
  }, [openConfirm, isAgent, deleteApp, appDetail.name, t]);

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

      <ConfirmModal />
    </AppContext.Provider>
  );
};

export default AppContextProvider;
