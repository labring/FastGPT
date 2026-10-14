import { getSystemInitData } from '@/web/common/system/api';
import { delay } from '@fastgpt/global/common/system/utils';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index';
import { useUserStore } from '@/web/support/user/useUserStore';
import { isLogoutInProgress } from '@/web/support/user/logoutState';

import { useSystemStore } from './useSystemStore';

let latestRequestId = 0;

/**
 * 同一初始化及其重试共用请求和会话快照，只有最新请求可以提交。
 * 过期成功、失败和等待中的重试都只读取当前缓存，避免重新发请求或覆盖新会话。
 */
export const clientInitData = async (
  retry = 3,
  pathname?: string
): Promise<{
  feConfigs: FastGPTFeConfigsType;
}> => {
  const requestId = ++latestRequestId;
  const { authGeneration } = useUserStore.getState();
  const isCurrentRequest = () =>
    requestId === latestRequestId && authGeneration === useUserStore.getState().authGeneration;
  const readCache = () => ({ feConfigs: useSystemStore.getState().feConfigs ?? {} });

  /** 重试不创建新请求快照，等待期间失效后直接结束。 */
  const fetchInitData = async (remaining: number): ReturnType<typeof clientInitData> => {
    if (!isCurrentRequest()) return readCache();
    try {
      const res = await getSystemInitData(useSystemStore.getState().initDataBufferId, pathname);
      if (!isCurrentRequest()) return readCache();
      // 退出请求尚未清除 Cookie 时，上游仍可能认作登录态，不能重新恢复这些配置。
      if (res.isAuthenticated && isLogoutInProgress()) return readCache();
      useSystemStore.getState().initStaticData(res, { authGeneration, pathname });

      return readCache();
    } catch (error) {
      if (!isCurrentRequest()) return readCache();
      if (remaining <= 0) throw error;
      await delay(500);
      return fetchInitData(remaining - 1);
    }
  };

  return fetchInitData(retry);
};
