import { PRICE_SCALE } from '@/constants/common';
const tokenKey = 'fast-gpt-token';

export const clearToken = () => {
  document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
};

/**
 * 把数据库读取到的price，转化成元
 */
export const formatPrice = (val = 0, multiple = 1) => {
  return Number(((val / PRICE_SCALE) * multiple).toFixed(10));
};
