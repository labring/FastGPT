export const RECENT_LOGIN_WINDOW_MS = 5 * 60 * 1000;

/**
 * 仅以当前服务端 Session 的创建时间判断近期登录。
 * 缺失、非有限值或未来时间都按需要重新验证处理。
 */
export const isRecentLoginSession = ({
  sessionCreatedAt,
  now = Date.now()
}: {
  sessionCreatedAt?: number;
  now?: number;
}) => {
  if (!Number.isFinite(sessionCreatedAt) || !Number.isFinite(now)) return false;

  const age = now - (sessionCreatedAt as number);
  return age >= 0 && age <= RECENT_LOGIN_WINDOW_MS;
};
