import { resolveAccountKindByUsername } from '../verification/utils';

/**
 * 「禁止 SSO 用户使用平台密码」策略所需的 SSO 配置切片。
 *
 * 只依赖 sso 两个字段而不是整个 FastGPTFeConfigsType，让服务端（global.feConfigs）、
 * Pro 管理端（配置表单）和主仓库管理端（useSystemStore）都能直接传入各自持有的对象，
 * 避免为了复用口径而互相引入不相关的类型依赖。
 */
export type SsoPasswordPolicyConfig = {
  url?: string;
  disablePasswordForSsoUsers?: boolean;
};

/**
 * 判断某个部署是否开启了「禁止 SSO 用户使用平台密码」。
 *
 * 口径：必须**同时**配置了 SSO 根地址并显式打开开关。只打开开关但没配 sso.url 时，
 * 用户名无法被分类为 sso（见 resolveAccountKindByUsername），策略不成立；
 * 反过来只配了 sso.url 也不应影响任何账号的密码能力。
 */
export const isSsoPasswordPolicyEnabled = (sso?: SsoPasswordPolicyConfig) =>
  Boolean(sso?.url) && sso?.disablePasswordForSsoUsers === true;

/**
 * 判断用户名是否属于当前 SSO 环境的账号。
 *
 * 复用共享的账号分类规则，保证邮箱、手机号和已知第三方前缀（wechat-/git-/google-/
 * microsoft-/wecom-）优先于通用「租户-账号」连字符规则，不会被误判成 SSO 账号。
 * 管理端新增用户时用户名还没入库，只能按同一规则在前端预判。
 */
export const isSsoUsername = (username: string | undefined, sso?: SsoPasswordPolicyConfig) =>
  resolveAccountKindByUsername({
    username: username ?? '',
    ssoConfigured: Boolean(sso?.url)
  }) === 'sso';

/**
 * 判断指定账号在当前 SSO 配置下是否允许使用/维护平台密码。
 *
 * 这是策略的唯一判定入口：策略未开启时任何账号都可用；策略开启时仅 SSO 命名空间下的
 * 账号被禁用。服务端在密码比对与写入前、管理端在置灰密码输入框时都应调用它，
 * 避免各处自行组合 sso.url 与开关导致口径漂移。
 */
export const isPasswordAvailableForUsername = (
  username: string | undefined,
  sso?: SsoPasswordPolicyConfig
) => !(isSsoPasswordPolicyEnabled(sso) && isSsoUsername(username, sso));
