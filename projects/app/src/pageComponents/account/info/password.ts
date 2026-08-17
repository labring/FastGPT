/** 判断当前账号是否允许从用户信息页进入密码管理。root 和企业微信账号不使用本地密码。 */
export const canManagePasswordFromAccountInfo = ({
  isPlus,
  username,
  passwordAvailable
}: {
  isPlus?: boolean;
  username?: string;
  passwordAvailable?: boolean;
}) =>
  isPlus === true &&
  passwordAvailable !== false &&
  !!username &&
  username !== 'root' &&
  !username.startsWith('wecom-');

/** 仅在用户详情已加载且当前账号允许使用密码时检查密码是否过期。 */
export const shouldCheckPasswordExpiration = ({
  userId,
  passwordAvailable
}: {
  userId?: string;
  passwordAvailable?: boolean;
}) => Boolean(userId) && passwordAvailable !== false;
