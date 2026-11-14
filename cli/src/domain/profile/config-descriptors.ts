import type { CliConfigFile, CliProfileConfig } from '../../infra/config/config-repository';
import { assertValidProfileName } from '../../shared/crypto';
import { CliArgumentError } from '../../shared/errors';
import type { GlobalCliOptions } from '../../shared/types';
import { DEFAULT_FASTGPT_BASE_URL, normalizeBaseUrl } from '../../shared/url';

export type ConfigDescriptor = {
  readonly key: string;
  readonly description: string;
  read: (params: {
    config: CliConfigFile;
    profileName: string;
    profile?: CliProfileConfig;
  }) => unknown;
  write: (params: {
    config: CliConfigFile;
    profileName: string;
    rawValue: string;
    global: GlobalCliOptions;
  }) => { nextConfig: CliConfigFile; value: unknown };
};

function parseBooleanString(rawValue: string): boolean {
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw new CliArgumentError(`Invalid boolean value "${rawValue}". Expected true or false.`);
}

function getOrInitProfile(config: CliConfigFile, profileName: string): CliProfileConfig {
  return (
    config.profiles[profileName] ?? {
      baseUrl: DEFAULT_FASTGPT_BASE_URL,
      updatedAt: Date.now()
    }
  );
}

/**
 * 声明式配置项描述符注册表：统一管理支持的配置键、读取路径、类型校验和写入逻辑。
 */
export const CONFIG_DESCRIPTORS: Record<string, ConfigDescriptor> = {
  currentProfile: {
    key: 'currentProfile',
    description: 'Default active CLI profile name',
    read: ({ config }) => config.currentProfile,
    write: ({ config, rawValue }) => {
      const target = assertValidProfileName(rawValue);
      if (!config.profiles[target]) {
        throw new CliArgumentError(`Profile "${target}" does not exist.`);
      }
      return {
        value: target,
        nextConfig: {
          ...config,
          currentProfile: target
        }
      };
    }
  },
  baseUrl: {
    key: 'baseUrl',
    description: 'FastGPT server API base URL for the selected profile',
    read: ({ profile }) => profile?.baseUrl ?? null,
    write: ({ config, profileName, rawValue, global }) => {
      const existing = getOrInitProfile(config, profileName);
      const allowInsecureHttp = global.allowInsecureHttp || existing.allowInsecureHttp === true;
      const normalized = normalizeBaseUrl(rawValue, { allowInsecureHttp });
      return {
        value: normalized,
        nextConfig: {
          ...config,
          profiles: {
            ...config.profiles,
            [profileName]: {
              ...existing,
              baseUrl: normalized,
              updatedAt: Date.now()
            }
          }
        }
      };
    }
  },
  allowInsecureHttp: {
    key: 'allowInsecureHttp',
    description: 'Allow non-loopback http:// URLs for the selected profile',
    read: ({ profile }) => profile?.allowInsecureHttp ?? false,
    write: ({ config, profileName, rawValue }) => {
      const existing = getOrInitProfile(config, profileName);
      const enabled = parseBooleanString(rawValue);
      return {
        value: enabled,
        nextConfig: {
          ...config,
          profiles: {
            ...config.profiles,
            [profileName]: {
              ...existing,
              allowInsecureHttp: enabled,
              updatedAt: Date.now()
            }
          }
        }
      };
    }
  }
};

export function getConfigDescriptor(key: string): ConfigDescriptor {
  const descriptor = CONFIG_DESCRIPTORS[key];
  if (!descriptor) {
    throw new CliArgumentError(
      `Unknown config key "${key}". Supported keys: ${Object.keys(CONFIG_DESCRIPTORS).join(', ')}.`
    );
  }
  return descriptor;
}
