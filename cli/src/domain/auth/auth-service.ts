import { DEFAULT_PROFILE_NAME, type ConfigRepository } from '../../infra/config/config-repository';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import type { SecretStore } from '../../infra/secrets/secret-store';
import type { CaptchaPreviewer } from '../../infra/ui/captcha-preview';
import type { Prompter } from '../../infra/ui/prompter';
import { assertValidProfileName } from '../../shared/crypto';
import { CliArgumentError } from '../../shared/errors';
import { maskSecret } from '../../shared/redact';
import type { CliResult, GlobalCliOptions } from '../../shared/types';
import {
  DEFAULT_FASTGPT_BASE_URL,
  FASTGPT_BASE_URL_PRESETS,
  normalizeBaseUrl,
  resolveServerAssetUrl
} from '../../shared/url';
import { resolveEffectiveAuth, type ResolvedAuthContext } from './auth-resolver';
import { buildProfileFromProbe, upsertProfileInConfig } from './profile-mapper';
import { runWhoamiProbeChain, type WhoamiProbeHandler } from './probe/probe-chain';
import type { LoginInputOptions, LoginMethod, LoginStrategy } from './strategies/login-strategy';

export type HttpClientFactory = (params: {
  baseUrl: string;
  insecure: boolean;
  caCertPath?: string;
  onSessionRenewed?: (expiresAt: number) => void;
}) => FastGptHttpClient;

export type AuthService = {
  login: (params: {
    global: GlobalCliOptions;
    input: LoginInputOptions & { noSwitch?: boolean };
  }) => Promise<CliResult>;
  logout: (params: {
    global: GlobalCliOptions;
    local?: boolean;
    purge?: boolean;
  }) => Promise<CliResult>;
  whoami: (params: {
    global: GlobalCliOptions;
    resolved: ResolvedAuthContext;
    noCacheUpdate?: boolean;
  }) => Promise<CliResult>;
  getStatus: (params: { global: GlobalCliOptions; verify?: boolean }) => Promise<CliResult>;
  switchTeam: (params: {
    global: GlobalCliOptions;
    resolved: ResolvedAuthContext;
    teamId: string;
  }) => Promise<CliResult>;
};

/**
 * 认证领域门面服务：编排登录策略、三层探活责任链、配置持久化与会话吊销。
 */
export function createAuthService({
  configRepo,
  secretStore,
  createHttpClient,
  probeHandlers,
  loginStrategies,
  env,
  prompter,
  readStdin,
  captchaPreviewer
}: {
  configRepo: ConfigRepository;
  secretStore: SecretStore;
  createHttpClient: HttpClientFactory;
  probeHandlers: readonly WhoamiProbeHandler[];
  loginStrategies: readonly LoginStrategy[];
  env: NodeJS.ProcessEnv;
  prompter: Prompter;
  readStdin: () => Promise<string>;
  captchaPreviewer?: CaptchaPreviewer;
}): AuthService {
  const strategyMap = new Map<LoginMethod, LoginStrategy>(
    loginStrategies.map((strategy) => [strategy.method, strategy])
  );

  const formatProbeDetail = (
    baseUrl: string,
    detail: NonNullable<Awaited<ReturnType<typeof runWhoamiProbeChain>>['detail']>
  ) => {
    if (detail.authType === 'token') {
      return {
        ...detail,
        user: {
          ...detail.user,
          avatar: resolveServerAssetUrl({
            baseUrl,
            assetPath: detail.user.avatar
          })
        }
      };
    }
    return detail;
  };

  const formatFallbackInfo = (
    baseUrl: string,
    fallbackInfo: Awaited<ReturnType<typeof runWhoamiProbeChain>>['fallbackInfo']
  ) => {
    if (!fallbackInfo) return undefined;
    return {
      ...fallbackInfo,
      ...(fallbackInfo.avatar !== undefined
        ? {
            avatar: resolveServerAssetUrl({
              baseUrl,
              assetPath: fallbackInfo.avatar
            })
          }
        : {})
    };
  };

  async function resolveLoginMethod(input: LoginInputOptions, selectedCount: number) {
    if (Boolean(input.apiKeyFlag) || input.apiKeyStdin) return 'apiKey' as const;
    if (Boolean(input.tokenFlag) || input.tokenStdin) return 'token' as const;
    if (Boolean(input.username) || input.passwordStdin) return 'password' as const;

    if (!prompter.isInteractive || selectedCount > 0) {
      throw new CliArgumentError(
        'Non-interactive login requires explicit credentials.',
        undefined,
        'Use --api-key-stdin, --token-stdin, or --username <user> --password-stdin.'
      );
    }

    return prompter.select<LoginMethod>({
      message: 'Select authentication method',
      initialValue: 'password',
      options: [
        {
          value: 'password',
          label: 'Username & Password',
          hint: 'Full management access (supports 2FA)'
        },
        { value: 'apiKey', label: 'API Key', hint: 'Recommended for CI / Agent automation' },
        { value: 'token', label: 'Session Token', hint: 'Paste browser token (SSO fallback)' }
      ]
    });
  }

  return {
    login: async ({ global, input }) => {
      const hasApiKey = Boolean(input.apiKeyFlag) || Boolean(input.apiKeyStdin);
      const hasToken = Boolean(input.tokenFlag) || Boolean(input.tokenStdin);
      const hasPassword = Boolean(input.username) || Boolean(input.passwordStdin);
      const selectedModeCount = [hasApiKey, hasToken, hasPassword].filter(Boolean).length;

      if (selectedModeCount > 1) {
        throw new CliArgumentError(
          'Cannot combine API Key, Session Token, and Password login flags in one call.'
        );
      }
      if (input.apiKeyFlag && input.apiKeyStdin) {
        throw new CliArgumentError('Cannot pass both --api-key and --api-key-stdin.');
      }
      if (input.tokenFlag && input.tokenStdin) {
        throw new CliArgumentError('Cannot pass both --token and --token-stdin.');
      }

      const { config, warnings } = await configRepo.read();
      const profileName = assertValidProfileName(
        global.profile ?? env.FASTGPT_PROFILE ?? config.currentProfile ?? DEFAULT_PROFILE_NAME
      );
      const existingProfile = config.profiles[profileName];

      const rawBaseUrl = await (async () => {
        const explicit = global.baseUrl ?? env.FASTGPT_BASE_URL;
        if (explicit) {
          return explicit;
        }
        if (prompter.isInteractive && selectedModeCount === 0) {
          const matchedPreset = existingProfile?.baseUrl
            ? FASTGPT_BASE_URL_PRESETS.find(
                (item) =>
                  normalizeBaseUrl(item.value, { allowInsecureHttp: true }) ===
                  existingProfile.baseUrl
              )
            : undefined;
          const customValue = '__custom__';
          const options = [
            ...(existingProfile?.baseUrl && !matchedPreset
              ? [
                  {
                    value: existingProfile.baseUrl,
                    label: existingProfile.baseUrl,
                    hint: 'Current profile'
                  }
                ]
              : []),
            ...FASTGPT_BASE_URL_PRESETS.map((item) => ({ ...item })),
            {
              value: customValue,
              label: 'Custom URL...',
              hint: 'Enter another FastGPT server URL'
            }
          ];
          const selected = await prompter.select<string>({
            message: 'Select FastGPT Base URL',
            options,
            initialValue:
              matchedPreset?.value ?? existingProfile?.baseUrl ?? FASTGPT_BASE_URL_PRESETS[0].value
          });
          if (selected === customValue) {
            return prompter.text({
              message: 'Enter custom FastGPT Base URL',
              placeholder: 'https://cloud.fastgpt.cn',
              ...(existingProfile?.baseUrl ? { defaultValue: existingProfile.baseUrl } : {})
            });
          }
          return selected;
        }
        return existingProfile?.baseUrl ?? DEFAULT_FASTGPT_BASE_URL;
      })();

      const allowInsecureHttp =
        global.allowInsecureHttp || existingProfile?.allowInsecureHttp === true;
      const baseUrl = normalizeBaseUrl(rawBaseUrl, { allowInsecureHttp });
      const client = createHttpClient({
        baseUrl,
        insecure: global.insecure,
        caCertPath: global.caCert
      });

      const method = await resolveLoginMethod(input, selectedModeCount);
      const strategy = strategyMap.get(method);
      if (!strategy) {
        throw new CliArgumentError(`No login strategy registered for method "${method}".`);
      }

      const auth = await strategy.authenticate({
        input,
        client,
        prompter,
        readStdin,
        captchaPreviewer
      });

      const probe = await runWhoamiProbeChain({
        handlers: probeHandlers,
        client,
        auth
      });

      const { backend } = await secretStore.setSecret(profileName, auth.secret);
      const nextProfile = buildProfileFromProbe({
        existing: existingProfile,
        baseUrl,
        allowInsecureHttp,
        secret: auth.secret,
        probe,
        storageMode: backend
      });
      const nextConfig = upsertProfileInConfig({
        config,
        profileName,
        profile: nextProfile,
        setAsCurrent: input.noSwitch !== true
      });
      await configRepo.write(nextConfig);

      return {
        changed: true,
        message: `Authenticated profile "${profileName}" (${auth.authType}${nextProfile.apiKeyType ? `:${nextProfile.apiKeyType}` : ''}).`,
        data: {
          profile: profileName,
          currentProfile: nextConfig.currentProfile,
          baseUrl: nextProfile.baseUrl,
          authType: nextProfile.authType,
          ...(nextProfile.apiKeyType ? { apiKeyType: nextProfile.apiKeyType } : {}),
          ...(nextProfile.boundAppId ? { boundAppId: nextProfile.boundAppId } : {}),
          ...(nextProfile.boundAppName ? { boundAppName: nextProfile.boundAppName } : {}),
          maskedSecret: nextProfile.maskedSecret,
          storageMode: backend,
          probeSource: probe.source,
          ...(nextProfile.user ? { user: nextProfile.user } : {}),
          ...(nextProfile.team ? { team: nextProfile.team } : {}),
          ...(nextProfile.sessionExpiresAt
            ? { sessionExpiresAt: new Date(nextProfile.sessionExpiresAt).toISOString() }
            : {})
        },
        warnings: [...warnings, ...probe.warnings]
      };
    },

    logout: async ({ global, local, purge }) => {
      const { config, warnings } = await configRepo.read();
      const profileName = assertValidProfileName(
        global.profile ?? env.FASTGPT_PROFILE ?? config.currentProfile ?? DEFAULT_PROFILE_NAME
      );
      const profile = config.profiles[profileName];
      const nextWarnings = [...warnings];

      let serverRevoked = false;
      if (profile?.authType === 'token' && !local) {
        const token = await secretStore.getSecret(profileName);
        if (token) {
          try {
            const client = createHttpClient({
              baseUrl: profile.baseUrl,
              insecure: global.insecure,
              caCertPath: global.caCert
            });
            await client.request({
              method: 'GET',
              path: '/support/user/account/loginout',
              auth: { authType: 'token', secret: token }
            });
            serverRevoked = true;
          } catch (error) {
            nextWarnings.push(
              `Failed to revoke server session (${error instanceof Error ? error.message : String(error)}); local credentials were still removed.`
            );
          }
        }
      } else if (profile?.authType === 'apikey') {
        nextWarnings.push(
          'API Key was removed locally. To invalidate the key on the server, delete it in the FastGPT console.'
        );
      }

      await secretStore.deleteSecret(profileName);

      if (profile) {
        const nextConfig = (() => {
          if (purge) {
            const remaining = { ...config.profiles };
            delete remaining[profileName];
            const fallbackCurrent =
              config.currentProfile === profileName
                ? (Object.keys(remaining)[0] ?? DEFAULT_PROFILE_NAME)
                : config.currentProfile;
            return {
              ...config,
              currentProfile: fallbackCurrent,
              profiles: remaining
            };
          }
          return {
            ...config,
            profiles: {
              ...config.profiles,
              [profileName]: {
                baseUrl: profile.baseUrl,
                ...(profile.allowInsecureHttp ? { allowInsecureHttp: true } : {}),
                updatedAt: Date.now()
              }
            }
          };
        })();
        await configRepo.write(nextConfig);
      }

      return {
        changed: Boolean(profile),
        message: profile
          ? `Logged out profile "${profileName}".`
          : `Profile "${profileName}" has no stored credentials.`,
        data: {
          profile: profileName,
          purged: Boolean(purge && profile),
          serverRevoked
        },
        warnings: nextWarnings
      };
    },

    whoami: async ({ global, resolved, noCacheUpdate }) => {
      const credential = resolved.credential!;
      const client = createHttpClient({
        baseUrl: resolved.baseUrl,
        insecure: global.insecure,
        caCertPath: global.caCert
      });

      const probe = await runWhoamiProbeChain({
        handlers: probeHandlers,
        client,
        auth: {
          authType: credential.authType,
          secret: credential.secret
        }
      });

      if (credential.source === 'profile' && !noCacheUpdate) {
        const { config } = await configRepo.read();
        const storageMode = resolved.profile?.storageMode ?? (await secretStore.getBackendName());
        const refreshed = buildProfileFromProbe({
          existing: resolved.profile,
          baseUrl: resolved.baseUrl,
          allowInsecureHttp: resolved.allowInsecureHttp,
          secret: credential.secret,
          probe,
          storageMode
        });
        const nextConfig = upsertProfileInConfig({
          config,
          profileName: resolved.profileName,
          profile: refreshed,
          setAsCurrent: false
        });
        await configRepo.write(nextConfig);
      }

      const data = (() => {
        if (probe.detail) {
          const formatted = formatProbeDetail(resolved.baseUrl, probe.detail);
          if (formatted.authType === 'token') {
            return {
              profile: resolved.profileName,
              source: credential.source,
              baseUrl: resolved.baseUrl,
              probeSource: probe.source,
              ...formatted,
              session: {
                createdAt: formatted.session.createdAt,
                expiresAt: formatted.session.expiresAt,
                expiresAtIso: new Date(formatted.session.expiresAt).toISOString()
              }
            };
          }
          return {
            profile: resolved.profileName,
            source: credential.source,
            baseUrl: resolved.baseUrl,
            probeSource: probe.source,
            ...formatted
          };
        }

        const resolvedFallback = formatFallbackInfo(resolved.baseUrl, probe.fallbackInfo);

        return {
          profile: resolved.profileName,
          source: credential.source,
          baseUrl: resolved.baseUrl,
          probeSource: probe.source,
          authType: probe.authType,
          ...(probe.apiKeyType ? { apiKeyType: probe.apiKeyType } : {}),
          maskedSecret: maskSecret(credential.secret),
          ...(resolvedFallback ? { fallbackInfo: resolvedFallback } : {})
        };
      })();

      return {
        changed: false,
        data,
        warnings: [...resolved.warnings, ...probe.warnings]
      };
    },

    getStatus: async ({ global, verify }) => {
      const { config, configPath, warnings } = await configRepo.read();
      const resolved = await resolveEffectiveAuth({
        options: global,
        env,
        configRepo,
        secretStore,
        existingConfig: config
      });
      const backend = await secretStore.getBackendName(resolved.profileName);

      const baseData: Record<string, unknown> = {
        profile: resolved.profileName,
        currentProfile: config.currentProfile,
        configPath,
        storageBackend: backend,
        baseUrl: resolved.baseUrl,
        authenticated: Boolean(resolved.credential),
        ...(resolved.credential
          ? {
              source: resolved.credential.source,
              authType: resolved.credential.authType,
              credentialKind: resolved.credential.kind,
              maskedSecret: maskSecret(resolved.credential.secret)
            }
          : {}),
        ...(resolved.profile?.user ? { user: resolved.profile.user } : {}),
        ...(resolved.profile?.team ? { team: resolved.profile.team } : {}),
        ...(resolved.profile?.boundAppId ? { boundAppId: resolved.profile.boundAppId } : {}),
        ...(resolved.profile?.boundAppName ? { boundAppName: resolved.profile.boundAppName } : {}),
        ...(resolved.profile?.sessionExpiresAt
          ? {
              sessionExpiresAt: new Date(resolved.profile.sessionExpiresAt).toISOString(),
              sessionExpired: resolved.profile.sessionExpiresAt <= Date.now()
            }
          : {})
      };

      if (!verify || !resolved.credential) {
        return {
          changed: false,
          data: baseData,
          warnings: [...warnings, ...resolved.warnings]
        };
      }

      const client = createHttpClient({
        baseUrl: resolved.baseUrl,
        insecure: global.insecure,
        caCertPath: global.caCert
      });
      const probe = await runWhoamiProbeChain({
        handlers: probeHandlers,
        client,
        auth: {
          authType: resolved.credential.authType,
          secret: resolved.credential.secret
        }
      });

      const liveIdentity = probe.detail
        ? formatProbeDetail(resolved.baseUrl, probe.detail)
        : undefined;
      const liveFallback = formatFallbackInfo(resolved.baseUrl, probe.fallbackInfo);

      return {
        changed: false,
        data: {
          ...baseData,
          verified: true,
          probeSource: probe.source,
          ...(liveIdentity ? { liveIdentity } : {}),
          ...(liveFallback ? { liveFallback } : {})
        },
        warnings: [...warnings, ...resolved.warnings, ...probe.warnings]
      };
    },

    switchTeam: async ({ global, resolved, teamId }) => {
      const normalizedTeamId = teamId.trim();
      if (!normalizedTeamId) {
        throw new CliArgumentError(
          'Team ID is required.',
          undefined,
          'Usage: fastgpt auth switch-team <teamId>'
        );
      }

      const client = createHttpClient({
        baseUrl: resolved.baseUrl,
        insecure: global.insecure,
        caCertPath: global.caCert
      });

      const nextToken = await client.request<string>({
        method: 'PUT',
        path: '/proApi/support/user/team/switch',
        body: { teamId: normalizedTeamId },
        auth: {
          authType: 'token',
          secret: resolved.credential!.secret
        }
      });

      if (typeof nextToken !== 'string' || !nextToken.trim()) {
        throw new CliArgumentError(
          'Server did not return a valid session token after switching team.'
        );
      }

      const probe = await runWhoamiProbeChain({
        handlers: probeHandlers,
        client,
        auth: { authType: 'token', secret: nextToken }
      });

      let storageMode = resolved.profile?.storageMode;
      if (resolved.credential!.source === 'profile') {
        const { config } = await configRepo.read();
        const saved = await secretStore.setSecret(resolved.profileName, nextToken);
        storageMode = saved.backend;
        const nextProfile = buildProfileFromProbe({
          existing: resolved.profile,
          baseUrl: resolved.baseUrl,
          allowInsecureHttp: resolved.allowInsecureHttp,
          secret: nextToken,
          probe,
          storageMode
        });
        const nextConfig = upsertProfileInConfig({
          config,
          profileName: resolved.profileName,
          profile: nextProfile,
          setAsCurrent: false
        });
        await configRepo.write(nextConfig);
      }

      return {
        changed: true,
        message: `Switched active team to "${normalizedTeamId}".`,
        data: {
          profile: resolved.profileName,
          teamId: normalizedTeamId,
          ...(probe.detail && probe.detail.authType === 'token'
            ? { team: probe.detail.team }
            : probe.fallbackInfo
              ? { teamId: probe.fallbackInfo.teamId, teamName: probe.fallbackInfo.teamName }
              : {}),
          ...(storageMode ? { storageMode } : {})
        },
        warnings: [...resolved.warnings, ...probe.warnings]
      };
    }
  };
}
