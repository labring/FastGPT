import React, {
  type Dispatch,
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
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
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
import { hasDebugToolInNodes } from '@fastgpt/global/core/app/utils';
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
        referenceSnapshots?: AppVersionSchemaType['referenceSnapshots'];
      }
    | undefined;
  reloadAppLatestVersion: () => void;
  reloadApp: () => void;
};

type SaveAppScope = {
  appId: string;
  latestToken: number;
};

type SaveAppParams = {
  scope: SaveAppScope;
  data: PostPublishAppProps;
  request?: WorkflowSaveRequest;
  saveToken: number;
  /** 捕获入队时的配置引用；Runtime effect 可能晚于保存响应同步编辑。 */
  chatConfigSnapshot: AppDetailType['chatConfig'];
};

type QueuedSaveApp = SaveAppParams & {
  resolve: (saved: boolean) => void;
  reject: (error: unknown) => void;
};

const isBackgroundSave = (data: PostPublishAppProps) =>
  data.autoSave === true && data.isPublish !== true;

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
  const saveScopeRef = useRef<SaveAppScope>({ appId, latestToken: 0 });
  const saveQueuesRef = useRef(new Map<string, QueuedSaveApp[]>());

  // layout effect 切换应用时立即废弃旧的保存作用域，即使之后回到同一 app。
  useBrowserLayoutEffect(() => {
    const scope = { appId, latestToken: 0 };
    saveScopeRef.current = scope;
    return () => {
      saveScopeRef.current = { appId, latestToken: 0 };
      const pending = saveQueuesRef.current.get(appId);
      if (!pending) return;
      // 已确认的显式保存和发布继续按原 appId 提交，离页只淘汰尚未提交的旧自动草稿。
      for (let index = pending.length - 1; index >= 0; index--) {
        const save = pending[index];
        if (save.scope === scope && isBackgroundSave(save.data)) {
          pending.splice(index, 1);
          save.resolve(false);
        }
      }
    };
  }, [appId]);

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

  /** 处理一笔已出队的保存。调用方负责 loading 和提示，队列直接等待 API 结果。 */
  const saveApp = useMemoizedFn(
    async ({ scope, data, request, saveToken, chatConfigSnapshot }: SaveAppParams) => {
      const isCurrentScope = () => scope === saveScopeRef.current;
      const isLatestSave = () => isCurrentScope() && saveToken === scope.latestToken;
      if (!isCurrentScope() && isBackgroundSave(data)) return false;

      if (data.isPublish && hasDebugToolInNodes(data.nodes)) {
        toast({
          title: t('app:publish_remove_debug_tool_tip'),
          status: 'warning'
        });
        throw new ToastHandledError('Debug tool cannot be published');
      }

      try {
        await postPublishApp(scope.appId, data);
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'statusText' in error &&
          error.statusText === AppErrEnum.unExist
        ) {
          saveQueuesRef.current
            .get(scope.appId)
            ?.splice(0)
            .forEach((save) => save.resolve(false));
          if (isCurrentScope()) router.replace('/dashboard/agent');
          return false;
        }
        if (!isCurrentScope()) return false;
        throw error;
      }

      if (!isCurrentScope()) {
        // 已卸载的 Workflow 编辑器仍需真实保存回执，以清理本次落库的本地备份。
        return !isBackgroundSave(data) || request !== undefined;
      }
      if (isLatestSave()) {
        // 配置会回灌 Runtime，等到更新执行时再次核对应用和请求快照。
        setAppDetail((state) => {
          if (state._id !== scope.appId || !isLatestSave()) return state;
          if (
            request &&
            (request.runtime.isDisposed() ||
              request.runtime.getSavepoint().contentRevision !== request.contentRevision)
          ) {
            return state;
          }
          return {
            ...state,
            nodes: data.nodes,
            edges: data.edges,
            ...(state.chatConfig === chatConfigSnapshot ? { chatConfig: data.chatConfig } : {}),
            ...(data.referenceSnapshots !== undefined && {
              referenceSnapshots: data.referenceSnapshots
            })
          };
        });
      }
      if (data.isPublish || isLatestSave()) reloadAppLatestVersion();
      return true;
    }
  );

  /** 每个应用按入队顺序保存，只有队尾连续自动草稿可以被最新草稿替换。 */
  const onSaveApp = useCallback(
    (data: PostPublishAppProps, request?: WorkflowSaveRequest) => {
      const scope = saveScopeRef.current;
      if (
        scope.appId !== appId ||
        appDetail._id !== appId ||
        !appDetail.permission.hasWritePer ||
        (request && request.appId !== appId)
      ) {
        return Promise.resolve(false);
      }

      return new Promise<boolean>((resolve, reject) => {
        const queues = saveQueuesRef.current;
        const runningQueue = queues.get(appId);
        const pending = runningQueue ?? [];
        const previous = pending.at(-1);
        if (previous && isBackgroundSave(previous.data) && isBackgroundSave(data)) {
          pending.pop();
          previous.resolve(false);
        }
        pending.push({
          scope,
          data,
          request,
          saveToken: ++scope.latestToken,
          chatConfigSnapshot: appDetail.chatConfig,
          resolve,
          reject
        });
        if (runningQueue) return;

        // 每项独立结算，失败后也继续提交后续显式操作。
        queues.set(appId, pending);
        void (async () => {
          try {
            for (let save = pending.shift(); save; save = pending.shift()) {
              try {
                save.resolve(await saveApp(save));
              } catch (error) {
                save.reject(error);
              }
            }
          } finally {
            queues.delete(appId);
          }
        })();
      });
    },
    [appDetail._id, appDetail.chatConfig, appDetail.permission.hasWritePer, appId, saveApp]
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
