const tokenKey = 'doc-gpt-token';

export const setToken = (val: string) => {
  localStorage.setItem(tokenKey, val);
};
export const getToken = () => {
  return localStorage.getItem(tokenKey);
};
export const clearToken = () => {
  localStorage.removeItem(tokenKey);
};
