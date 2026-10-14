import { getSystemInitData } from '@/web/common/system/api';
import { delay } from '@fastgpt/global/common/system/utils';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index';
import { useUserStore } from '@/web/support/user/useUserStore';
import { isLogoutInProgress, getPendingLogoutRequest } from '@/web/support/user/logoutState';

import { useSystemStore } from './useSystemStore';

let latestRequestId = 0;
let inFlightRequest:
  | { authGeneration: number; promise: Promise<{ feConfigs: FastGPTFeConfigsType }> }
  | undefined;

/**
 * 同一会话的并发初始化共用请求及重试，新会话启动独立请求；只有最新请求可以提交。
 * 过期成功、失败和等待中的重试都只读取当前缓存，避免重新发请求或覆盖新会话。
 */
export const clientInitData = (
  retry = 3
): Promise<{
  feConfigs: FastGPTFeConfigsType;
}> => {
  const { authGeneration } = useUserStore.getState();
  if (inFlightRequest?.authGeneration === authGeneration) return inFlightRequest.promise;
  const requestId = ++latestRequestId;
  const isCurrentRequest = () =>
    requestId === latestRequestId && authGeneration === useUserStore.getState().authGeneration;
  const readCache = () => ({ feConfigs: useSystemStore.getState().feConfigs ?? {} });

  /** 重试不创建新请求快照，等待期间失效后直接结束。 */
  const fetchInitData = async (remaining: number): ReturnType<typeof clientInitData> => {
    if (!isCurrentRequest()) return readCache();
    try {
      // 监听退出状态会早于 Cookie 清除完成，等服务端退出结束后再获取匿名配置。
      const pendingLogout = getPendingLogoutRequest();
      if (pendingLogout) await pendingLogout;
      if (!isCurrentRequest()) return readCache();
      const res = await getSystemInitData(useSystemStore.getState().initDataBufferId);
      if (!isCurrentRequest()) return readCache();
      // 退出请求尚未清除 Cookie 时，上游仍可能认作登录态，不能重新恢复这些配置。
      if (res.isAuthenticated && isLogoutInProgress()) return readCache();
      useSystemStore.getState().initStaticData(res, { authGeneration });

      return readCache();
    } catch (error) {
      if (!isCurrentRequest()) return readCache();
      if (remaining <= 0) throw error;
      await delay(500);
      return fetchInitData(remaining - 1);
    }
  };

  const request = { authGeneration, promise: fetchInitData(retry) };
  inFlightRequest = request;
  const clearRequest = () => {
    if (inFlightRequest === request) inFlightRequest = undefined;
  };
  void request.promise.then(clearRequest, clearRequest);
  return request.promise;
};
