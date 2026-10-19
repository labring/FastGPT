import { resolveAccountKindByUsername } from '../verification/utils';

/**
 * 「禁止 SSO 用户使用平台密码」策略所需的 SSO 配置切片。
 *
 * 服务端先根据 systemEnv.sso.url 派生 enabled，客户端直接消费该能力标志。
 * 策略函数只接收能力与开关，不依赖地址或整个配置对象。
 */
export type SsoPasswordPolicyConfig = {
  enabled?: boolean;
  disablePasswordForSsoUsers?: boolean;
};

/**
 * 判断某个部署是否开启了「禁止 SSO 用户使用平台密码」。
 *
 * 口径：必须**同时**接入 SSO 并显式打开开关。只打开开关但未接入 SSO 时，
 * 用户名无法被分类为 sso（见 resolveAccountKindByUsername），策略不成立；
 * 反过来只接入 SSO 也不应影响任何账号的密码能力。
 */
export const isSsoPasswordPolicyEnabled = (sso?: SsoPasswordPolicyConfig) =>
  sso?.enabled === true && sso?.disablePasswordForSsoUsers === true;

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
    ssoConfigured: sso?.enabled === true
  }) === 'sso';

/**
 * 判断指定账号在当前 SSO 配置下是否允许使用/维护平台密码。
 *
 * 这是策略的唯一判定入口：策略未开启时任何账号都可用；策略开启时仅 SSO 命名空间下的
 * 账号被禁用。服务端在密码比对与写入前、管理端在置灰密码输入框时都应调用它，
 * 避免各处自行组合 SSO 接入状态与开关导致口径漂移。
 */
export const isPasswordAvailableForUsername = (
  username: string | undefined,
  sso?: SsoPasswordPolicyConfig
) => !(isSsoPasswordPolicyEnabled(sso) && isSsoUsername(username, sso));
