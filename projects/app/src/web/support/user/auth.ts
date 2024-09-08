import { loginOut } from '@/web/support/user/api';

const tokenKey = 'token';
export const clearToken = () => {
  try {
    localStorage.removeItem(tokenKey);
    return loginOut();
  } catch (error) {
    error;
  }
};

export const setToken = (token: string) => {
  if (typeof window === 'undefined') return '';
  localStorage.setItem(tokenKey, token);
};
export const getToken = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(tokenKey) || '';
};
