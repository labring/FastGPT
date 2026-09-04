import {
  AccountEmailUsernameSchema,
  AccountPhoneUsernameSchema,
  type AccountVerificationCapabilities,
  type AccountVerificationMethod,
  type AccountVerificationPasswordPolicy,
  type AccountVerificationResolution,
  type RecognizedAccountKind
} from './type';

/**
 * 该纯函数只做账号分类和验证方式选择，不读取运行环境。
 * 只有调用方显式允许且数据库确认存在密码时，才降级为旧密码验证。
 */
export const resolveAccountVerificationByUsername = ({
  username,
  capabilities,
  allowPasswordFallback,
  oldPasswordAvailable
}: {
  username: string;
  capabilities: AccountVerificationCapabilities;
} & AccountVerificationPasswordPolicy): AccountVerificationResolution => {
  const normalizedUsername = username.trim();
  if (!normalizedUsername) {
    return {
      status: 'unsupported',
      accountKind: 'invalid',
      unsupportedReason: 'empty_username'
    };
  }

  const hasPrefix = (prefix: string) =>
    normalizedUsername.startsWith(`${prefix}-`) && normalizedUsername.length > prefix.length + 1;
  const firstSeparatorIndex = normalizedUsername.indexOf('-');
  const hasSsoPrefix =
    firstSeparatorIndex > 0 && firstSeparatorIndex < normalizedUsername.length - 1;

  // 联系方式优先于通用 SSO 前缀，避免带连字符的合法邮箱被误判。
  const accountKind = (() => {
    if (AccountEmailUsernameSchema.safeParse(normalizedUsername).success) return 'email';
    if (AccountPhoneUsernameSchema.safeParse(normalizedUsername).success) return 'phone';
    if (hasPrefix('wechat')) return 'wechat';
    if (hasPrefix('git')) return 'github';
    if (hasPrefix('google')) return 'google';
    if (hasPrefix('microsoft')) return 'microsoft';
    if (hasPrefix('wecom')) return 'wecom';
    if (capabilities.oauth.sso && hasSsoPrefix) return 'sso';
    return 'local';
  })() satisfies RecognizedAccountKind;

  type ExternalVerificationMethod = Exclude<AccountVerificationMethod, 'oldPassword'>;

  const candidateMethods: readonly ExternalVerificationMethod[] = (() => {
    switch (accountKind) {
      case 'email':
      case 'phone':
        return ['code'];
      case 'wechat':
        return ['wechat'];
      case 'github':
        return ['oauth/github'];
      case 'google':
        return ['oauth/google'];
      case 'microsoft':
        return ['oauth/microsoft'];
      case 'wecom':
        return ['oauth/sso', 'oauth/wecom'];
      case 'sso':
        return ['oauth/sso'];
      case 'local':
        return [];
      default: {
        const exhaustiveAccountKind: never = accountKind;
        return exhaustiveAccountKind;
      }
    }
  })();

  const isMethodAvailable = (method: ExternalVerificationMethod) => {
    switch (method) {
      case 'code':
        return accountKind === 'email' ? capabilities.emailCode : capabilities.phoneCode;
      case 'wechat':
        return capabilities.wechat;
      case 'oauth/github':
        return capabilities.oauth.github;
      case 'oauth/google':
        return capabilities.oauth.google;
      case 'oauth/microsoft':
        return capabilities.oauth.microsoft;
      case 'oauth/wecom':
        return capabilities.oauth.wecom;
      case 'oauth/sso':
        return capabilities.oauth.sso;
      default: {
        const exhaustiveMethod: never = method;
        return exhaustiveMethod;
      }
    }
  };

  const method = candidateMethods.find(isMethodAvailable);
  if (method) {
    return {
      status: 'supported',
      accountKind,
      method
    };
  }

  if (allowPasswordFallback && oldPasswordAvailable) {
    return {
      status: 'supported',
      accountKind,
      method: 'oldPassword'
    };
  }

  return {
    status: 'unsupported',
    accountKind,
    unsupportedReason: 'no_available_verification_method'
  };
};
