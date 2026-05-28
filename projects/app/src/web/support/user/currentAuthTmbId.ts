let currentAuthTmbId = '';

/**
 * 记录当前标签页内存中的登录团队成员 ID。
 * 该值不会跨标签页同步，用于 403 跳登录时把“当前标签页原身份”固化到 query。
 */
export const setCurrentAuthTmbId = (tmbId?: string) => {
  currentAuthTmbId = tmbId || '';
};

/**
 * 读取当前标签页内存中的登录团队成员 ID。
 */
export const getCurrentAuthTmbId = () => currentAuthTmbId;
