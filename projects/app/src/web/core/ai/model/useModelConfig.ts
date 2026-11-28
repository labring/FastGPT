import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
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
  // ahooks 3.9.5 中被后续请求取代的 runAsync Promise 永不落定；改为统一挂起等待并在最新一次成功/失败时批量唤醒，避免并发刷新卡死调用方。
  const refreshWaitersRef = useRef<{ resolve: () => void; reject: (error: unknown) => void }[]>([]);
  const settleRefreshWaiters = useCallback(
    (result: { ok: true } | { ok: false; error: unknown }) => {
      const waiters = refreshWaitersRef.current.splice(0);
      for (const waiter of waiters) {
        if (result.ok) {
          waiter.resolve();
        } else {
          waiter.reject(result.error);
        }
      }
    },
    []
  );

  useEffect(() => {
    return () => {
      refreshWaitersRef.current = [];
    };
  }, []);

  const request = useRequest<ModelConfigResponse, []>(() => getModelConfig({ channelType }), {
    manual,
    refreshDeps: [isTeam],
    onSuccess: () => settleRefreshWaiters({ ok: true }),
    onError: (error) => settleRefreshWaiters({ ok: false, error })
  });

  const { run } = request;
  const models = useMemo(() => request.data?.models ?? [], [request.data?.models]);
  const channels = useMemo(() => request.data?.channels ?? [], [request.data?.channels]);
  const defaultModelIds = useMemo(
    () => (request.data as GetSystemModelConfigResponse | undefined)?.defaultModelIds ?? {},
    [request.data]
  );
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
  const refresh = useCallback(() => {
    useUserModelStore.getState().clearMemory();
    return new Promise<void>((resolve, reject) => {
      refreshWaitersRef.current.push({ resolve, reject });
      run();
    });
  }, [run]);

  return {
    ...request,
    data: request.data,
    models,
    channels,
    providers,
    defaultModelIds,
    getModelProvider,
    getModelProviders,
    refresh,
    loading: request.loading
  };
};
