/** 判断当前账号是否允许从用户信息页进入密码管理。root 和企业微信账号不使用本地密码。 */
export const canManagePasswordFromAccountInfo = ({
  isPlus,
  username
}: {
  isPlus?: boolean;
  username?: string;
}) => isPlus === true && !!username && username !== 'root' && !username.startsWith('wecom-');
