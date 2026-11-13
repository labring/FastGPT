import type { ExecCommandFn } from './exec-command';
import { getKeychainAccountKey, KEYCHAIN_SERVICE } from './keychain-common';
import type { SecretStoreStrategy } from './secret-store';

/**
 * Linux Secret Service (`secret-tool`) 凭据策略：仅在具备 D-Bus 会话总线且二进制存在时启用。
 */
export function createLinuxSecretToolStore({
  execCommand,
  env
}: {
  execCommand: ExecCommandFn;
  env: NodeJS.ProcessEnv;
}): SecretStoreStrategy {
  return {
    backend: 'keychain',
    isAvailable: async () => {
      if (!env.DBUS_SESSION_BUS_ADDRESS) {
        return false;
      }
      const res = await execCommand({
        command: 'secret-tool',
        args: ['--help']
      });
      // libsecret 的 secret-tool 不一定支持特定探活参数并返回 0，只要非 ENOENT(127) 即表示可执行文件存在。
      return res.code !== 127;
    },
    get: async (profileName) => {
      const res = await execCommand({
        command: 'secret-tool',
        args: ['lookup', 'service', KEYCHAIN_SERVICE, 'account', getKeychainAccountKey(profileName)]
      });
      if (res.code === 0 && res.stdout.trim().length > 0) {
        return res.stdout.trim();
      }
      return undefined;
    },
    set: async (profileName, secret) => {
      const res = await execCommand({
        command: 'secret-tool',
        args: [
          'store',
          '--label=FastGPT CLI Credential',
          'service',
          KEYCHAIN_SERVICE,
          'account',
          getKeychainAccountKey(profileName)
        ],
        stdin: secret
      });
      return res.code === 0;
    },
    delete: async (profileName) => {
      await execCommand({
        command: 'secret-tool',
        args: ['clear', 'service', KEYCHAIN_SERVICE, 'account', getKeychainAccountKey(profileName)]
      });
    }
  };
}
