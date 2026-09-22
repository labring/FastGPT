/**
 * 账号（邮箱 / 手机号 / 用户名）通用展示工具。
 *
 * 这些函数与具体业务子域无关：注销、改密、登录二次验证都要向前端返回脱敏后的联系方式，
 * 因此放在账号层共享，避免某个业务子域（例如 cancellation）成为其它流程的隐式依赖。
 */

/**
 * 生成可展示、不可反推的账号脱敏值。
 *
 * 邮箱保留前 2 位和完整域名，11 位手机号保留前 3 后 4，其余短账号只保留首尾少量字符。
 * 入参为空时返回空串，调用方无需再做空值判断。
 * 脱敏值只用于界面展示，不能作为验证或路由依据。
 */
export const maskAccount = (account?: string) => {
  if (!account) return '';
  const at = account.indexOf('@');
  if (at > 1) return `${account.slice(0, 2)}***${account.slice(at)}`;
  if (/^1\d{10}$/.test(account)) return `${account.slice(0, 3)}****${account.slice(-4)}`;
  if (account.length <= 4) return `${account.slice(0, 1)}***`;
  return `${account.slice(0, 2)}***${account.slice(-2)}`;
};
