import { loginOut } from '@/web/support/user/api';

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
  try {
    clearAdStorage();
    return loginOut();
  } catch (error) {
    error;
  }
};
