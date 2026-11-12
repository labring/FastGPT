import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
const META_BACKENDS_FILE = '.secret-backends.json';

async function loadAuthoritativeBackends(
  configDir?: string
): Promise<Record<string, SecretStoreBackend>> {
  if (!configDir) return {};
  try {
    const raw = await readFile(join(configDir, META_BACKENDS_FILE), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, SecretStoreBackend>)
      : {};
  } catch {
    return {};
  }
}

async function saveAuthoritativeBackend({
  configDir,
  profileName,
  backend
}: {
  configDir?: string;
  profileName: string;
  backend?: SecretStoreBackend;
}): Promise<void> {
  if (!configDir) return;
  const current = await loadAuthoritativeBackends(configDir);
  if (backend) {
    current[profileName] = backend;
  } else {
    delete current[profileName];
  }
  const metaPath = join(configDir, META_BACKENDS_FILE);
  await writeFile(metaPath, JSON.stringify(current, null, 2), { mode: 0o600 });
  if (process.platform !== 'win32') {
    await chmod(metaPath, 0o600).catch(() => {});
  }
}

/**
 * 组合模式凭据存储：优先尝试主 Keychain 策略，不可用或写入失败时优雅降级到 0600 文件策略，
 * 并持久化记录每个 profile 的权威存储后端（.secret-backends.json），避免 Keychain 暂时不可用恢复后，
 * 以旧 Keychain 记录覆盖后来成功保存到文件的更新凭据。
 */
export function createCompositeSecretStore({
  primary,
  fallback,
  configDir,
  onFallbackWarning
}: {
  primary?: SecretStoreStrategy;
  fallback: SecretStoreStrategy;
  configDir?: string;
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
      if (profileName) {
        const authoritative = await loadAuthoritativeBackends(configDir);
        const recorded = authoritative[profileName];
        if (recorded) {
          return recorded;
        }
      }

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
      const authoritative = await loadAuthoritativeBackends(configDir);
      const preferred = authoritative[profileName];

      if (preferred === 'file') {
        const inFallback = await fallback.get(profileName);
        if (inFallback !== undefined) {
          // Keychain 已恢复但文件是最新权威副本：尝试顺便清理掉 Keychain 残留旧凭据
          if (primary && (await primary.isAvailable())) {
            await primary.delete(profileName).catch(() => {});
          }
          return inFallback;
        }
      }

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
          await fallback.delete(profileName).catch((error: unknown) => {
            onFallbackWarning?.(
              `Keychain write succeeded, but cleaning stale credentials.json failed: ${error instanceof Error ? error.message : String(error)}`
            );
          });
          await saveAuthoritativeBackend({ configDir, profileName, backend: primary.backend });
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
      await saveAuthoritativeBackend({ configDir, profileName, backend: fallback.backend });
      return { backend: fallback.backend };
    },
    deleteSecret: async (profileName) => {
      if (primary && (await primary.isAvailable())) {
        await primary.delete(profileName).catch(() => {});
      }
      await fallback.delete(profileName).catch(() => {});
      await saveAuthoritativeBackend({ configDir, profileName, backend: undefined });
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
    return createCompositeSecretStore({ fallback: fileStore, configDir });
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
    configDir,
    onFallbackWarning
  });
}
