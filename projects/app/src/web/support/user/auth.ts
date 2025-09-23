import { loginOut } from '@/web/support/user/api';
import { clearCsrfToken } from '@/web/common/utils/csrfToken';

export const clearToken = async () => {
  try {
    clearCsrfToken();
    return loginOut();
  } catch (error) {
    clearCsrfToken();
    error;
  }
};
