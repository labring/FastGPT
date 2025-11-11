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

export const clearToken = () => {
  try {
    clearOperationalAdStorage();
    return loginOut();
  } catch (error) {
    error;
  }
};
