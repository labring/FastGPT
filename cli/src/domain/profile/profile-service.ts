import { DEFAULT_PROFILE_NAME, type ConfigRepository } from '../../infra/config/config-repository';
import { assertValidProfileName } from '../../shared/crypto';
import { CliArgumentError } from '../../shared/errors';
import type { CliResult, GlobalCliOptions } from '../../shared/types';
import { getConfigDescriptor } from './config-descriptors';

export type ProfileService = {
  listProfiles: () => Promise<CliResult>;
  switchProfile: (params: { targetName?: string }) => Promise<CliResult>;
  listConfig: () => Promise<CliResult>;
  getConfigValue: (params: { global: GlobalCliOptions; key: string }) => Promise<CliResult>;
  setConfigValue: (params: {
    global: GlobalCliOptions;
    key: string;
    rawValue: string;
  }) => Promise<CliResult>;
};

/**
 * Profile 与配置领域服务：隔离配置读写、Profile 切换与表驱动配置变更。
 */
export function createProfileService({
  configRepo,
  env
}: {
  configRepo: ConfigRepository;
  env: NodeJS.ProcessEnv;
}): ProfileService {
  function resolveProfileName(configCurrentProfile: string, explicitProfile?: string) {
    return assertValidProfileName(
      explicitProfile ?? env.FASTGPT_PROFILE ?? configCurrentProfile ?? DEFAULT_PROFILE_NAME
    );
  }

  return {
    listProfiles: async () => {
      const { config, warnings } = await configRepo.read();
      const profiles = Object.entries(config.profiles).map(([name, profile]) => ({
        name,
        active: name === config.currentProfile,
        baseUrl: profile.baseUrl,
        authType: profile.authType ?? null,
        apiKeyType: profile.apiKeyType ?? null,
        maskedSecret: profile.maskedSecret ?? null,
        username: profile.user?.username ?? null,
        teamName: profile.team?.teamName ?? null,
        storageMode: profile.storageMode ?? null,
        sessionExpiresAt: profile.sessionExpiresAt
          ? new Date(profile.sessionExpiresAt).toISOString()
          : null
      }));

      return {
        changed: false,
        data: {
          currentProfile: config.currentProfile,
          profiles
        },
        warnings
      };
    },

    switchProfile: async ({ targetName }) => {
      if (!targetName) {
        throw new CliArgumentError(
          'Profile name is required.',
          undefined,
          'Usage: fastgpt auth switch <profile>'
        );
      }
      const profileName = assertValidProfileName(targetName);
      const { config, warnings } = await configRepo.read();

      if (!config.profiles[profileName]) {
        throw new CliArgumentError(
          `Profile "${profileName}" does not exist.`,
          { availableProfiles: Object.keys(config.profiles) },
          `Run "fastgpt login --profile ${profileName}" to create it.`
        );
      }

      await configRepo.write({
        ...config,
        currentProfile: profileName
      });

      return {
        changed: true,
        message: `Switched current profile to "${profileName}".`,
        data: {
          currentProfile: profileName,
          baseUrl: config.profiles[profileName].baseUrl,
          authType: config.profiles[profileName].authType ?? null
        },
        warnings
      };
    },

    listConfig: async () => {
      const { config, configPath, warnings } = await configRepo.read();
      return {
        changed: false,
        data: {
          configPath,
          currentProfile: config.currentProfile,
          profiles: config.profiles
        },
        warnings
      };
    },

    getConfigValue: async ({ global, key }) => {
      const descriptor = getConfigDescriptor(key);
      const { config, warnings } = await configRepo.read();
      const profileName = resolveProfileName(config.currentProfile, global.profile);
      const value = descriptor.read({
        config,
        profileName,
        profile: config.profiles[profileName]
      });

      return {
        changed: false,
        data: {
          profile: profileName,
          key: descriptor.key,
          value
        },
        warnings
      };
    },

    setConfigValue: async ({ global, key, rawValue }) => {
      const descriptor = getConfigDescriptor(key);
      const { config, warnings } = await configRepo.read();
      const profileName = resolveProfileName(config.currentProfile, global.profile);
      const { nextConfig, value } = descriptor.write({
        config,
        profileName,
        rawValue,
        global
      });

      await configRepo.write(nextConfig);

      return {
        changed: true,
        message: `Updated ${key} to ${String(value)}.`,
        data: {
          profile: profileName,
          key: descriptor.key,
          value
        },
        warnings
      };
    }
  };
}
