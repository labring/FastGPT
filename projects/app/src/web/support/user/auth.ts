import { loginOut } from '@/web/support/user/api';
import {
  useUserModelStore,
  resetUserModelCatalogAfterLogin
} from '@/web/core/ai/model/useUserModelStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { UserType } from '@fastgpt/global/support/user/type';
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

/** 并发退出共用请求，立即撤销身份和配置就绪状态；调用方在退出成功后导航或主动取匿名配置。 */
export const clearToken = () => {
  const pendingRequest = getPendingLogoutRequest();
  if (pendingRequest) return pendingRequest;

  beginLogout();
  useUserStore.getState().invalidateAuthSession();
  useSystemStore.setState({ authenticatedConfigGeneration: undefined, initDataPage: undefined });
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

/** 服务端确认登录或密码变更成功后，原子切换会话并主动刷新一次完整配置；刷新失败不撤销已成功的登录。 */
export const initClientAfterLogin = async (user: UserType) => {
  resetUserModelCatalogAfterLogin();
  useUserStore.getState().setUserInfo(user, true);
  const { clientInitData } = await import('@/web/common/system/staticData');
  await clientInitData(3, window.location.pathname).catch((error) => {
    console.error('Refresh initialization after login failed:', error);
  });
};
