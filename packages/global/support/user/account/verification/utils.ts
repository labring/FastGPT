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
 * 根据持久化 username 和部署能力推导唯一验证方式。
 * 该纯函数只做分类和降级，不读取运行环境，也不改写传入的 username。
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

  /** Provider 前缀必须完整匹配，且分隔符后至少保留一个字符。 */
  const hasPrefix = (prefix: string) =>
    normalizedUsername.startsWith(`${prefix}-`) && normalizedUsername.length > prefix.length + 1;

  const firstSeparatorIndex = normalizedUsername.indexOf('-');
  const hasSsoPrefix =
    firstSeparatorIndex > 0 && firstSeparatorIndex < normalizedUsername.length - 1;

  // 邮箱和手机号必须先于通用连字符规则，避免合法邮箱被误判为 SSO。
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

  type ConfiguredAccountVerificationMethod = Exclude<AccountVerificationMethod, 'oldPassword'>;

  const candidateMethods: readonly ConfiguredAccountVerificationMethod[] = (() => {
    switch (accountKind) {
      case 'email':
      case 'phone':
        return ['code'] as const;
      case 'local':
        return [];
      case 'wechat':
        return ['wechat'] as const;
      case 'github':
        return ['oauth/github'] as const;
      case 'google':
        return ['oauth/google'] as const;
      case 'microsoft':
        return ['oauth/microsoft'] as const;
      case 'sso':
        return ['oauth/sso'] as const;
      case 'wecom':
        return ['oauth/sso', 'oauth/wecom'] as const;
      default: {
        const exhaustiveAccountKind: never = accountKind;
        return exhaustiveAccountKind;
      }
    }
  })();

  const isMethodAvailable = (method: ConfiguredAccountVerificationMethod) => {
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
