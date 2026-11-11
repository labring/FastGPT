import type { SecretStoreBackend } from '../../shared/types';
import { execSystemCommand, type ExecCommandFn } from './exec-command';
import { createFileSecretStore } from './file-secret-store';
import { createLinuxSecretToolStore } from './linux-secret-tool-store';
import { createMacosKeychainStore } from './macos-keychain-store';

export type SecretStoreStrategy = {
  readonly backend: SecretStoreBackend;
  isAvailable: () => Promise<boolean>;
  get: (profileName: string) => Promise<string | undefined>;
  set: (profileName: string, secret: string) => Promise<boolean>;
  delete: (profileName: string) => Promise<void>;
};

export type SecretStore = {
  getBackendName: (profileName?: string) => Promise<SecretStoreBackend>;
  getSecret: (profileName: string) => Promise<string | undefined>;
  setSecret: (profileName: string, secret: string) => Promise<{ backend: SecretStoreBackend }>;
  deleteSecret: (profileName: string) => Promise<void>;
};

/**
 * 组合模式凭据存储：优先尝试主 Keychain 策略，不可用或写入失败时优雅降级到 0600 文件策略，
 * 并确保主/备存储之间不会因残留旧凭据造成跨后端读取错配。
 */
export function createCompositeSecretStore({
  primary,
  fallback,
  onFallbackWarning
}: {
  primary?: SecretStoreStrategy;
  fallback: SecretStoreStrategy;
  onFallbackWarning?: (reason: string) => void;
}): SecretStore {
  let warnedFallback = false;

  const warnOnce = (reason: string) => {
    if (warnedFallback) {
      return;
    }
    warnedFallback = true;
    onFallbackWarning?.(reason);
  };

  return {
    getBackendName: async (profileName) => {
      const primaryAvailable = primary ? await primary.isAvailable() : false;
      if (profileName && primary && primaryAvailable) {
        const inPrimary = await primary.get(profileName);
        if (inPrimary !== undefined) {
          return primary.backend;
        }
        try {
          const inFallback = await fallback.get(profileName);
          if (inFallback !== undefined) {
            return fallback.backend;
          }
        } catch {
          return fallback.backend;
        }
      }
      return primaryAvailable && primary ? primary.backend : fallback.backend;
    },
    getSecret: async (profileName) => {
      if (primary && (await primary.isAvailable())) {
        const value = await primary.get(profileName);
        if (value !== undefined) {
          return value;
        }
      }
      return fallback.get(profileName);
    },
    setSecret: async (profileName, secret) => {
      if (primary && (await primary.isAvailable())) {
        const stored = await primary.set(profileName, secret);
        if (stored) {
          // 清理旧降级文件中的同名明文记录；文件权限异常等不阻断已成功的 Keychain 登录。
          await fallback.delete(profileName).catch((error: unknown) => {
            onFallbackWarning?.(
              `Keychain write succeeded, but cleaning stale credentials.json failed: ${error instanceof Error ? error.message : String(error)}`
            );
          });
          return { backend: primary.backend };
        }
        warnOnce('System keychain write failed; falling back to 0600 credentials.json.');
      } else if (primary) {
        warnOnce('System keychain unavailable; storing credentials in 0600 credentials.json.');
      }

      // 降级写入前清理主存储旧值，防止后续 Keychain 恢复后读取到已失效的旧凭据。
      if (primary && (await primary.isAvailable())) {
        await primary.delete(profileName).catch(() => {});
      }
      await fallback.set(profileName, secret);
      return { backend: fallback.backend };
    },
    deleteSecret: async (profileName) => {
      if (primary && (await primary.isAvailable())) {
        await primary.delete(profileName);
      }
      await fallback.delete(profileName);
    }
  };
}

/**
 * 根据运行平台与环境变量装配默认凭据存储。
 */
export function createDefaultSecretStore({
  configDir,
  env = process.env,
  platform = process.platform,
  execCommand = execSystemCommand,
  onFallbackWarning
}: {
  configDir: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  execCommand?: ExecCommandFn;
  onFallbackWarning?: (reason: string) => void;
}): SecretStore {
  const fileStore = createFileSecretStore({ configDir });
  if (env.FASTGPT_SECRET_STORE === 'file') {
    return createCompositeSecretStore({ fallback: fileStore });
  }

  const primary = (() => {
    if (platform === 'darwin') {
      return createMacosKeychainStore({ execCommand });
    }
    if (platform === 'linux') {
      return createLinuxSecretToolStore({ execCommand, env });
    }
    return undefined;
  })();

  return createCompositeSecretStore({
    primary,
    fallback: fileStore,
    onFallbackWarning
  });
}
