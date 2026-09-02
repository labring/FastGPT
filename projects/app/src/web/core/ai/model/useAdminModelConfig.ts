import { useCallback, useMemo } from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getAdminModelConfig } from '@/web/core/ai/config';
import {
  formatModelProviders,
  getModelProviderFromCache,
  getModelProviderListFromCache
} from '@fastgpt/global/core/ai/provider';

/** 管理员模型页面的独立数据源，不读取普通成员 useUserModelStore。 */
export const useAdminModelConfig = () => {
  const request = useRequest(getAdminModelConfig, { manual: false });
  const providerCache = useMemo(
    () => formatModelProviders(request.data?.providers ?? []),
    [request.data?.providers]
  );
  const getModelProviders = useCallback(
    (language?: string) =>
      getModelProviderListFromCache(providerCache.ModelProviderListCache, language),
    [providerCache.ModelProviderListCache]
  );
  const getModelProvider = useCallback(
    (provider?: string, language?: string) =>
      getModelProviderFromCache({ cache: providerCache.ModelProviderMapCache, provider, language }),
    [providerCache.ModelProviderMapCache]
  );

  return {
    ...request,
    systemModelList: request.data?.models ?? [],
    defaultModelIds: request.data?.defaultModelIds ?? {},
    aiproxyChannels: request.data?.aiproxyChannels ?? [],
    getModelProvider,
    getModelProviders
  };
};
