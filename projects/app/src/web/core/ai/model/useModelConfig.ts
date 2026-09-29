import { useCallback, useMemo } from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  formatModelProviders,
  getModelProviderFromCache,
  getModelProviderListFromCache
} from '@fastgpt/global/core/ai/model/provider';
import type {
  GetSystemModelConfigResponse,
  GetTeamModelsResponse,
  SystemModelListItem
} from '@fastgpt/global/openapi/core/ai/model/api';
import { getAdminModelConfig, getTeamModelsConfig } from './api';
import { useUserModelStore } from './useUserModelStore';

type ModelConfigResponse = GetSystemModelConfigResponse | GetTeamModelsResponse;

/** 统一加载 system/team 模型管理配置，并封装 Provider 缓存与刷新副作用。 */
export const useModelConfig = ({
  channelType,
  language
}: {
  channelType: 'system' | 'team';
  language: string;
}) => {
  const isTeam = channelType === 'team';
  const request = useRequest<ModelConfigResponse, []>(
    () => (isTeam ? getTeamModelsConfig() : getAdminModelConfig()),
    { manual: false, refreshDeps: [isTeam] }
  );
  const models = useMemo(
    () => (request.data?.models ?? []) as SystemModelListItem[],
    [request.data?.models]
  );
  const channels = useMemo(() => request.data?.channels ?? [], [request.data?.channels]);
  const providerCache = useMemo(
    () => formatModelProviders(request.data?.providers ?? []),
    [request.data?.providers]
  );
  const getModelProvider = useCallback(
    (provider?: string, targetLanguage?: string) =>
      getModelProviderFromCache({
        cache: providerCache.ModelProviderMapCache,
        provider,
        language: targetLanguage
      }),
    [providerCache.ModelProviderMapCache]
  );
  const providers = useMemo(
    () => getModelProviderListFromCache(providerCache.ModelProviderListCache, language),
    [language, providerCache.ModelProviderListCache]
  );
  const refresh = useCallback(async () => {
    useUserModelStore.getState().clearMemory();
    await request.runAsync();
  }, [request.runAsync]);

  return {
    data: request.data,
    models,
    channels,
    providers,
    getModelProvider,
    refresh,
    loading: request.loading
  };
};
