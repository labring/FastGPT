import { useUserStore } from '@/web/support/user/useUserStore';
import { useCallback, useEffect, useState } from 'react';
import { getModelReadIdentity, type ModelReadOptions } from './modelData';
import { useUserModelStore } from './useUserModelStore';

/** 单个业务读请求的生命周期；身份切换立即隐藏旧结果，卸载或参数变化后忽略过期响应。 */
export const useModelQuery = <T>({
  enabled = true,
  observeCatalog = true,
  queryKey,
  read,
  outLinkAuthData
}: ModelReadOptions & {
  enabled?: boolean;
  observeCatalog?: boolean;
  queryKey: string;
  read: () => Promise<T>;
}) => {
  useUserStore((state) => state.userInfo?.team?.teamId);
  useUserStore((state) => state.userInfo?.team?.tmbId);
  useUserModelStore((state) => state.loginGeneration);
  const version = useUserModelStore((state) => (observeCatalog ? state.version : undefined));
  const identity = getModelReadIdentity({ outLinkAuthData });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const key =
    enabled && identity ? JSON.stringify([identity.key, queryKey, revision, version]) : undefined;
  const [requestState, setRequestState] = useState({ key, token: {} });
  // 每次关闭、切换参数或刷新都会结束上一代请求；再次使用同一查询也不能复用完成状态。
  const request = requestState.key === key ? requestState : { key, token: {} };
  if (request !== requestState) setRequestState(request);
  const [state, setState] = useState<{ token?: object; data?: T; error?: unknown }>({});
  useEffect(() => {
    if (!key) return;
    let active = true;
    read().then(
      (data) => {
        if (active) setState({ token: request.token, data });
      },
      (error) => {
        if (active) setState({ token: request.token, error });
      }
    );
    return () => {
      active = false;
    };
  }, [key, read, request.token]);
  const current = state.token === request.token ? state : undefined;
  return {
    refresh,
    data: key ? current?.data : undefined,
    loading: !!enabled && (!key || !current),
    loaded: !!key && !!current && !current.error,
    error: key ? current?.error : undefined
  };
};
