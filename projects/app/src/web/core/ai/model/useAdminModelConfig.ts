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
  // 加载中和失败时保持空集合引用稳定，避免消费方 effect -> setState 形成渲染循环。
  const systemModelList = useMemo(() => request.data?.models ?? [], [request.data?.models]);
  const defaultModelIds = useMemo(
    () => request.data?.defaultModelIds ?? {},
    [request.data?.defaultModelIds]
  );
  const aiproxyChannels = useMemo(
    () => request.data?.aiproxyChannels ?? [],
    [request.data?.aiproxyChannels]
  );
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
    systemModelList,
    defaultModelIds,
    aiproxyChannels,
    getModelProvider,
    getModelProviders
  };
};
