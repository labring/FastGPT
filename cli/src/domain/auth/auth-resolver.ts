import type {
  CliConfigFile,
  CliProfileConfig,
  ConfigRepository
} from '../../infra/config/config-repository';
import { DEFAULT_PROFILE_NAME } from '../../infra/config/config-repository';
import type { SecretStore } from '../../infra/secrets/secret-store';
import { assertValidProfileName } from '../../shared/crypto';
import { CliArgumentError, CliAuthError } from '../../shared/errors';
import type {
  AuthCredentialKind,
  CliAuthModeRequirement,
  GlobalCliOptions
} from '../../shared/types';
import { DEFAULT_FASTGPT_BASE_URL, normalizeBaseUrl } from '../../shared/url';

export type ResolvedCredential = {
  source: 'flag' | 'env' | 'profile';
  authType: 'token' | 'apikey';
  secret: string;
  kind: AuthCredentialKind | 'unknownApiKey';
  apiKeyType?: 'personal' | 'app';
  boundAppId?: string;
  sessionExpiresAt?: number;
};

export type ResolvedAuthContext = {
  profileName: string;
  profile?: CliProfileConfig;
  baseUrl: string;
  allowInsecureHttp: boolean;
  credential?: ResolvedCredential;
  warnings: string[];
};

/**
 * 按 `flag > env > profile/keychain > 默认` 优先级解析生效的 Base URL 与凭据；
 * 若环境变量同时配置了 `FASTGPT_TOKEN` 与 `FASTGPT_API_KEY` 且未显式覆盖，直接报冲突错误。
 */
export async function resolveEffectiveAuth({
  options,
  env,
  configRepo,
  secretStore,
  existingConfig
}: {
  options: Pick<GlobalCliOptions, 'profile' | 'baseUrl' | 'token' | 'apiKey' | 'allowInsecureHttp'>;
  env: NodeJS.ProcessEnv;
  configRepo: ConfigRepository;
  secretStore: SecretStore;
  existingConfig?: CliConfigFile;
}): Promise<ResolvedAuthContext> {
  if (options.token && options.apiKey) {
    throw new CliArgumentError('Cannot pass both --token and --api-key at the same time.');
  }

  const loaded = existingConfig
    ? { config: existingConfig, warnings: [] as string[] }
    : await configRepo.read();

  const profileName = assertValidProfileName(
    options.profile ?? env.FASTGPT_PROFILE ?? loaded.config.currentProfile ?? DEFAULT_PROFILE_NAME
  );
  const profile = loaded.config.profiles[profileName];
  const allowInsecureHttp = options.allowInsecureHttp || profile?.allowInsecureHttp === true;
  const rawBaseUrl =
    options.baseUrl ?? env.FASTGPT_BASE_URL ?? profile?.baseUrl ?? DEFAULT_FASTGPT_BASE_URL;
  const baseUrl = normalizeBaseUrl(rawBaseUrl, { allowInsecureHttp });

  const envToken = env.FASTGPT_TOKEN?.trim() || undefined;
  const envApiKey = env.FASTGPT_API_KEY?.trim() || undefined;

  if (!options.token && !options.apiKey && envToken && envApiKey) {
    throw new CliAuthError({
      code: 'AUTH_CONFLICT',
      message: 'Both FASTGPT_TOKEN and FASTGPT_API_KEY are set in environment variables.',
      hint: 'Unset one of them, or explicitly select one with --token or --api-key.'
    });
  }

  const warnings = [...loaded.warnings];

  const credential = await (async (): Promise<ResolvedCredential | undefined> => {
    if (options.token) {
      return {
        source: 'flag',
        authType: 'token',
        secret: options.token.trim(),
        kind: 'token'
      };
    }

    if (options.apiKey) {
      return {
        source: 'flag',
        authType: 'apikey',
        secret: options.apiKey.trim(),
        kind: 'unknownApiKey'
      };
    }

    if (envToken) {
      return {
        source: 'env',
        authType: 'token',
        secret: envToken,
        kind: 'token'
      };
    }

    if (envApiKey) {
      return {
        source: 'env',
        authType: 'apikey',
        secret: envApiKey,
        kind: 'unknownApiKey'
      };
    }

    if (!profile?.authType) {
      return undefined;
    }

    const secret = await secretStore.getSecret(profileName);
    if (!secret) {
      warnings.push(
        `Profile "${profileName}" metadata exists without stored secret; run "fastgpt login --profile ${profileName}".`
      );
      return undefined;
    }

    if (profile.authType === 'token') {
      return {
        source: 'profile',
        authType: 'token',
        secret,
        kind: 'token',
        sessionExpiresAt: profile.sessionExpiresAt
      };
    }

    const kind =
      profile.apiKeyType === 'app'
        ? 'appKey'
        : profile.apiKeyType === 'personal'
          ? 'personalKey'
          : 'unknownApiKey';

    return {
      source: 'profile',
      authType: 'apikey',
      secret,
      kind,
      apiKeyType: profile.apiKeyType,
      boundAppId: profile.boundAppId
    };
  })();

  return {
    profileName,
    profile,
    baseUrl,
    allowInsecureHttp,
    credential,
    warnings
  };
}

/**
 * 本地预检门禁：发出网络请求前校验当前凭据类型与本地缓存的过期时间。
 */
export function assertAuthAllowed({
  resolved,
  authModes,
  commandName,
  now = Date.now()
}: {
  resolved: ResolvedAuthContext;
  authModes: readonly CliAuthModeRequirement[];
  commandName: string;
  now?: number;
}): void {
  if (authModes.includes('none')) {
    return;
  }

  const credential = resolved.credential;
  if (!credential) {
    throw new CliAuthError({
      code: 'AUTH_REQUIRED',
      message: `Command "${commandName}" requires authentication, but no active credential was found for profile "${resolved.profileName}".`,
      hint: `Run "fastgpt login --profile ${resolved.profileName}" or set FASTGPT_API_KEY / FASTGPT_TOKEN.`
    });
  }

  if (
    credential.source === 'profile' &&
    credential.authType === 'token' &&
    credential.sessionExpiresAt !== undefined &&
    credential.sessionExpiresAt <= now
  ) {
    throw new CliAuthError({
      code: 'AUTH_EXPIRED',
      message: `Session for profile "${resolved.profileName}" has expired (FastGPT sessions have a 7-day TTL).`,
      hint: `Run "fastgpt login --profile ${resolved.profileName}" to sign in again.`
    });
  }

  const matches = (() => {
    if (credential.kind === 'token') {
      return authModes.includes('token');
    }
    if (credential.kind === 'personalKey') {
      return authModes.includes('personalKey');
    }
    if (credential.kind === 'appKey') {
      return authModes.includes('appKey');
    }
    return authModes.includes('personalKey') || authModes.includes('appKey');
  })();

  if (matches) {
    return;
  }

  if (credential.kind === 'appKey') {
    throw new CliAuthError({
      code: 'AUTH_MODE_UNSUPPORTED',
      message: `Command "${commandName}" cannot use an app-scoped API Key${credential.boundAppId ? ` (bound to app ${credential.boundAppId})` : ''}.`,
      hint: 'Switch to a personal API Key or run "fastgpt login" to use a user session.'
    });
  }

  if (authModes.includes('token') && !authModes.includes('personalKey')) {
    throw new CliAuthError({
      code: 'AUTH_MODE_UNSUPPORTED',
      message: `Command "${commandName}" requires a user session token, but current active credential is an API Key.`,
      hint: 'Run "fastgpt login" to sign in with username/password, or pass "--token <sessionToken>".'
    });
  }

  throw new CliAuthError({
    code: 'AUTH_MODE_UNSUPPORTED',
    message: `Command "${commandName}" does not support credential type "${credential.kind}".`,
    hint: `Allowed credential modes: ${authModes.join(', ')}.`
  });
}
