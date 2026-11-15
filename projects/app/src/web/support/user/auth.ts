import { loginOut } from '@/web/support/user/api';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import { beginLogout } from './logoutState';
import { clearChatInputDrafts } from '@/web/core/chat/inputDraft/storage';

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

/** 清理当前页面认证状态；只有用户主动退出时才撤销服务端会话，迟到认证错误不能撤销新登录。 */
export const clearToken = ({ revoke = false }: { revoke?: boolean } = {}) => {
  beginLogout();
  clearChatInputDrafts();
  try {
    clearAdStorage();
    // 退出只清内存；持久目录保留到下一次真实登录成功后统一删除。
    useUserModelStore.getState().clearMemory();
    if (revoke) return loginOut();
  } catch (error) {
    console.error('Failed to clear token:', error);
  }
};
