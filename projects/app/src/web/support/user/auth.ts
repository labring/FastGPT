import { loginOut } from '@/web/support/user/api';

export const clearToken = () => {
  try {
    return loginOut();
  } catch (error) {
    error;
  }
};
