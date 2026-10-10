import { useCallback, useMemo } from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  formatModelProviders,
  getModelProviderFromCache,
  getModelProviderListFromCache
} from '@fastgpt/global/core/ai/model/provider';
import type {
  GetSystemModelConfigResponse,
  GetTeamModelsResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import { getModelConfig } from './api';
import { useUserModelStore } from './useUserModelStore';

type ModelConfigResponse = GetSystemModelConfigResponse | GetTeamModelsResponse;

/** 统一加载 system/team 模型管理配置，并封装 Provider 缓存与刷新副作用。 */
export const useModelConfig = ({
  channelType,
  language,
  manual = false
}: {
  channelType: ChannelType;
  language?: string;
  manual?: boolean;
}) => {
  const isTeam = channelType === 'team';
  const request = useRequest<ModelConfigResponse, []>(() => getModelConfig({ channelType }), {
    manual,
    refreshDeps: [isTeam]
  });

  const { runAsync } = request;
  const models = useMemo(() => request.data?.models ?? [], [request.data?.models]);
  const channels = useMemo(() => request.data?.channels ?? [], [request.data?.channels]);
  const defaultModelIds = useMemo(
    () => (request.data as GetSystemModelConfigResponse | undefined)?.defaultModelIds ?? {},
    [request.data]
  );
  const aiproxyChannels = useMemo(() => {
    const rawChannels =
      (request.data as GetSystemModelConfigResponse | undefined)?.aiproxyChannels ?? [];
    if (rawChannels.length > 0) return rawChannels;
    return useSystemStore.getState().aiproxyChannels ?? [];
  }, [request.data]);
  const providerCache = useMemo(
    () => formatModelProviders(request.data?.providers ?? []),
    [request.data?.providers]
  );
  const getModelProvider = useCallback(
    (provider?: string, targetLanguage?: string) =>
      getModelProviderFromCache({
        cache: providerCache.ModelProviderMapCache,
        provider,
        language: targetLanguage ?? language
      }),
    [language, providerCache.ModelProviderMapCache]
  );
  const providers = useMemo(
    () => getModelProviderListFromCache(providerCache.ModelProviderListCache, language),
    [language, providerCache.ModelProviderListCache]
  );
  const getModelProviders = useCallback(
    (targetLanguage?: string) =>
      getModelProviderListFromCache(
        providerCache.ModelProviderListCache,
        targetLanguage ?? language
      ),
    [language, providerCache.ModelProviderListCache]
  );
  const refresh = useCallback(async () => {
    useUserModelStore.getState().clearMemory();
    await runAsync();
  }, [runAsync]);

  return {
    ...request,
    data: request.data,
    models,
    channels,
    providers,
    aiproxyChannels,
    defaultModelIds,
    getModelProvider,
    getModelProviders,
    refresh,
    loading: request.loading
  };
};
