import { loginOut } from '@/web/support/user/api';

const tokenKey = 'token';
export const clearToken = () => {
  try {
    loginOut();
    localStorage.removeItem(tokenKey);
  } catch (error) {
    error;
  }
};

export const setToken = (token: string) => {
  localStorage.setItem(tokenKey, token);
};
export const getToken = () => {
  return localStorage.getItem(tokenKey) || '';
};
