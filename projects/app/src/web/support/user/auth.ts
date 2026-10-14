import { loginOut } from '@/web/support/user/api';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { beginLogout, getPendingLogoutRequest, setPendingLogoutRequest } from './logoutState';
import { useUserStore } from './useUserStore';

const clearAdStorage = () => {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('logout-')) {
        const oldValue = localStorage.getItem(key);
        localStorage.removeItem(key);

        // Dispatch ahooks sync event to update useLocalStorageState
        if (oldValue !== null) {
          window.dispatchEvent(
            new CustomEvent('AHOOKS_SYNC_STORAGE_EVENT_NAME', {
              detail: {
                key,
                newValue: null,
                oldValue,
                storageArea: localStorage
              }
            })
          );
        }
      }
    });
  } catch (error) {
    console.error('Failed to clear ad storage:', error);
  }
};

/** 并发退出共用请求，立即撤销身份和配置就绪状态；初始化监听等待退出完成后重新获取匿名配置。 */
export const clearToken = () => {
  const pendingRequest = getPendingLogoutRequest();
  if (pendingRequest) return pendingRequest;

  beginLogout();
  useUserStore.getState().invalidateAuthSession();
  useSystemStore.setState({ authenticatedConfigGeneration: undefined });
  try {
    clearAdStorage();
    // 退出只清内存；持久目录保留到下一次真实登录成功后统一删除。
    useUserModelStore.getState().clearMemory();
    const request = loginOut();
    setPendingLogoutRequest(request);
    return request;
  } catch (error) {
    console.error('Failed to clear token:', error);
  }
};
