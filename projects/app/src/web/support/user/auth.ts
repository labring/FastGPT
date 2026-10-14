import { loginOut } from '@/web/support/user/api';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import { beginLogout, isLogoutInProgress } from './logoutState';
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

/** 先撤销本地会话，Cookie 清除后刷新匿名配置；迟到的完成回调不更新已恢复的新会话。 */
export const clearToken = () => {
  beginLogout();
  useUserStore.getState().invalidateAuthSession();
  try {
    clearAdStorage();
    // 退出只清内存；持久目录保留到下一次真实登录成功后统一删除。
    useUserModelStore.getState().clearMemory();
    return loginOut().finally(() => {
      // Cookie 在服务端退出完成后才清除，届时再触发匿名初始化。
      // 已经重新登录时不让迟到的退出回调撤销新会话。
      if (isLogoutInProgress()) useUserStore.getState().invalidateAuthSession();
    });
  } catch (error) {
    console.error('Failed to clear token:', error);
  }
};
