import {
  AccountEmailUsernameSchema,
  AccountPhoneUsernameSchema,
  type AccountKind,
  type AccountVerificationCapabilities,
  type AccountVerificationMethod,
  type AccountVerificationPasswordPolicy,
  type AccountVerificationResolution
} from './type';

/**
 * 根据持久化 username 和 SSO 配置状态识别账号类型。
 * 邮箱、手机号和已知第三方前缀优先于通用 SSO 连字符规则。
 */
export const resolveAccountKindByUsername = ({
  username,
  ssoConfigured
}: {
  username: string;
  ssoConfigured: boolean;
}): AccountKind => {
  const normalizedUsername = username.trim();
  if (!normalizedUsername) return 'invalid';

  const firstSeparatorIndex = normalizedUsername.indexOf('-');
  const prefix =
    firstSeparatorIndex > 0 && firstSeparatorIndex < normalizedUsername.length - 1
      ? normalizedUsername.slice(0, firstSeparatorIndex)
      : undefined;

  if (AccountEmailUsernameSchema.safeParse(normalizedUsername).success) return 'email';
  if (AccountPhoneUsernameSchema.safeParse(normalizedUsername).success) return 'phone';
  if (prefix === 'wechat') return 'wechat';
  if (prefix === 'git') return 'github';
  if (prefix === 'google') return 'google';
  if (prefix === 'microsoft') return 'microsoft';
  if (prefix === 'wecom') return 'wecom';
  if (ssoConfigured && prefix) return 'sso';
  return 'local';
};

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
  const accountKind = resolveAccountKindByUsername({
    username,
    ssoConfigured: capabilities.oauth.sso
  });
  if (accountKind === 'invalid') {
    return {
      status: 'unsupported',
      accountKind: 'invalid',
      unsupportedReason: 'empty_username'
    };
  }

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
