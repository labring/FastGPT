import {
  CliProfileConfigSchema,
  type CliConfigFile,
  type CliProfileConfig
} from '../../infra/config/config-repository';
import { maskSecret } from '../../shared/redact';
import type { SecretStoreBackend } from '../../shared/types';
import type { WhoamiProbeResult } from './probe/probe-chain';

/**
 * 将 `probe` 结果映射为安全可落盘的 Profile 元数据，只保存脱敏展示摘要。
 */
export function buildProfileFromProbe({
  existing,
  baseUrl,
  allowInsecureHttp,
  secret,
  probe,
  storageMode,
  now = Date.now()
}: {
  existing?: CliProfileConfig;
  baseUrl: string;
  allowInsecureHttp: boolean;
  secret: string;
  probe: WhoamiProbeResult;
  storageMode: SecretStoreBackend;
  now?: number;
}): CliProfileConfig {
  const base: CliProfileConfig = {
    baseUrl,
    ...(allowInsecureHttp ? { allowInsecureHttp: true } : {}),
    authType: probe.authType,
    maskedSecret: maskSecret(secret),
    storageMode,
    updatedAt: now
  };

  if (probe.detail) {
    if (probe.detail.authType === 'token') {
      return CliProfileConfigSchema.parse({
        ...base,
        user: {
          userId: probe.detail.user.userId,
          username: probe.detail.user.username
        },
        team: {
          teamId: probe.detail.team.teamId,
          teamName: probe.detail.team.teamName,
          tmbId: probe.detail.team.tmbId
        },
        isRoot: probe.detail.isRoot,
        sessionExpiresAt: probe.detail.session.expiresAt
      });
    }

    return CliProfileConfigSchema.parse({
      ...base,
      apiKeyType: probe.detail.apiKeyType,
      apiKeyName: probe.detail.apiKey.name,
      ...(probe.detail.apiKey.boundAppId ? { boundAppId: probe.detail.apiKey.boundAppId } : {}),
      ...(probe.detail.apiKey.boundAppName
        ? { boundAppName: probe.detail.apiKey.boundAppName }
        : {}),
      user: {
        userId: probe.detail.user.userId,
        username: probe.detail.user.username
      },
      team: {
        teamId: probe.detail.team.teamId,
        teamName: probe.detail.team.teamName,
        tmbId: probe.detail.team.tmbId
      }
    });
  }

  return CliProfileConfigSchema.parse({
    ...base,
    ...(probe.apiKeyType ? { apiKeyType: probe.apiKeyType } : {}),
    ...(probe.fallbackInfo?.boundAppId
      ? { boundAppId: probe.fallbackInfo.boundAppId }
      : existing?.boundAppId
        ? { boundAppId: existing.boundAppId }
        : {}),
    ...(probe.fallbackInfo?.userId && probe.fallbackInfo?.username
      ? {
          user: {
            userId: probe.fallbackInfo.userId,
            username: probe.fallbackInfo.username
          }
        }
      : existing?.user
        ? { user: existing.user }
        : {}),
    ...(probe.fallbackInfo?.teamId && probe.fallbackInfo?.teamName && probe.fallbackInfo?.tmbId
      ? {
          team: {
            teamId: probe.fallbackInfo.teamId,
            teamName: probe.fallbackInfo.teamName,
            tmbId: probe.fallbackInfo.tmbId
          }
        }
      : existing?.team
        ? { team: existing.team }
        : {})
  });
}

export function upsertProfileInConfig({
  config,
  profileName,
  profile,
  setAsCurrent
}: {
  config: CliConfigFile;
  profileName: string;
  profile: CliProfileConfig;
  setAsCurrent: boolean;
}): CliConfigFile {
  return {
    ...config,
    currentProfile: setAsCurrent ? profileName : config.currentProfile,
    profiles: {
      ...config.profiles,
      [profileName]: profile
    }
  };
}
