import { loginOut } from '@/web/support/user/api';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import { beginLogout } from './logoutState';

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

export const clearToken = () => {
  beginLogout();
  try {
    clearAdStorage();
    // 退出只清内存；持久目录保留到下一次真实登录成功后统一删除。
    useUserModelStore.getState().clearMemory();
    return loginOut();
  } catch (error) {
    console.error('Failed to clear token:', error);
  }
};
