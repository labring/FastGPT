export const LAST_AUTH_TMB_ID_STORAGE_KEY = 'fastgpt_last_auth_tmb_id_v1';

const isLocalStorageAvailable = () => typeof window !== 'undefined' && !!window.localStorage;

/**
 * 全局记录最近一次已登录的团队成员 ID。
 * 只在拿到有效 tmbId 时写入，退出登录或登录页清 token 不清理该值，供下一次登录后判断是否仍是同一身份。
 */
export const markLastAuthTmbId = (tmbId?: string) => {
  if (!isLocalStorageAvailable() || !tmbId) return;

  try {
    window.localStorage.setItem(LAST_AUTH_TMB_ID_STORAGE_KEY, tmbId);
  } catch (error) {
    console.warn('[Auth tmbId] Failed to mark last tmbId:', error);
  }
};

/**
 * 读取最近一次已登录的团队成员 ID。
 * 该值是全局身份记录，不做消费删除；登录成功写入新 userInfo 后会自然更新。
 */
export const getLastAuthTmbId = () => {
  if (!isLocalStorageAvailable()) return '';

  try {
    return window.localStorage.getItem(LAST_AUTH_TMB_ID_STORAGE_KEY) || '';
  } catch (error) {
    console.warn('[Auth tmbId] Failed to read last tmbId:', error);
    return '';
  }
};
