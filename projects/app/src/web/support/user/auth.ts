import { loginOut } from '@/web/support/user/api';

const clearOperationalAdStorage = () => {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('hidden-until-')) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('Failed to clear operational ad storage:', error);
  }
};
const clearActivityAdStorage = () => {
  try {
    const key = 'activity_ad_closed';
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
  } catch (error) {
    console.error('Failed to clear activity ad storage:', error);
  }
};

export const clearToken = () => {
  try {
    clearOperationalAdStorage();
    return loginOut();
  } catch (error) {
    error;
  }
};
