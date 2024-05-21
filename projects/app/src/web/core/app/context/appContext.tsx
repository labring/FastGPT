import { Dispatch, ReactNode, SetStateAction, useCallback, useState } from 'react';
import { createContext } from 'use-context-selector';
import { defaultApp } from '../constants';
import { getAppDetailById, putAppById } from '../api';
import { useRequest } from 'ahooks';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { AppDetailType } from '@fastgpt/global/core/app/type';
import { AppUpdateParams, PostPublishAppProps } from '@/global/core/app/api';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { postPublishApp } from '../versionApi';

type AppContextType = {
  appDetail: AppDetailType;
  setAppDetail: Dispatch<SetStateAction<AppDetailType>>;
  loadingApp: boolean;
  updateAppDetail: (data: AppUpdateParams) => Promise<void>;
  publishApp: (data: PostPublishAppProps) => Promise<void>;
};

export const AppContext = createContext<AppContextType>({
  appDetail: defaultApp,
  setAppDetail: function (value: SetStateAction<AppDetailType>): void {
    throw new Error('Function not implemented.');
  },
  loadingApp: false,
  updateAppDetail: function (data: AppUpdateParams): Promise<void> {
    throw new Error('Function not implemented.');
  },
  publishApp: function (data: PostPublishAppProps): Promise<void> {
    throw new Error('Function not implemented.');
  }
});

export const AppContextProvider = ({ children, appId }: { children: ReactNode; appId: string }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const [appDetail, setAppDetail] = useState(defaultApp);

  const { loading } = useRequest(
    () => {
      if (appId) {
        return getAppDetailById(appId);
      }
      return Promise.resolve(defaultApp);
    },
    {
      refreshDeps: [appId],
      onSuccess(res) {
        setAppDetail(res);
      },
      onError(err: any) {
        toast({
          title: err?.message || t('core.app.error.Get app failed'),
          status: 'error'
        });
        router.replace('/app/list');
      }
    }
  );

  const updateAppDetail = useCallback(
    async (data: AppUpdateParams) => {
      try {
        await putAppById(appId, data);
        setAppDetail((state) => {
          return {
            ...state,
            ...data,
            modules: data?.nodes || state.modules
          };
        });
      } catch (error) {
        toast({
          status: 'warning',
          title: getErrText(error)
        });
      }
    },
    [appId, toast]
  );
  const publishApp = useCallback(
    async (data: PostPublishAppProps) => {
      try {
        await postPublishApp(appId, data);
        setAppDetail((state) => {
          return {
            ...state,
            ...data,
            modules: data?.nodes || state.modules
          };
        });
      } catch (error) {
        toast({
          status: 'warning',
          title: getErrText(error)
        });
      }
    },
    [appId, toast]
  );

  const contextValue = {
    appDetail,
    setAppDetail,
    loadingApp: loading,
    updateAppDetail,
    publishApp
  };

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};
