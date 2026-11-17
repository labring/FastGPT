import type { ExecCommandFn } from './exec-command';
import { getKeychainAccountKey, KEYCHAIN_SERVICE } from './keychain-common';
import type { SecretStoreStrategy } from './secret-store';

/**
 * macOS Keychain 凭据策略：通过 `security -i` + `-X <hex>` 从 stdin 写入密钥，绝不在 argv 暴露明文。
 */
export function createMacosKeychainStore({
  execCommand
}: {
  execCommand: ExecCommandFn;
}): SecretStoreStrategy {
  return {
    backend: 'keychain',
    isAvailable: async () => {
      const res = await execCommand({
        command: '/usr/bin/security',
        args: ['default-keychain']
      });
      return res.code === 0;
    },
    get: async (profileName) => {
      const res = await execCommand({
        command: '/usr/bin/security',
        args: [
          'find-generic-password',
          '-s',
          KEYCHAIN_SERVICE,
          '-a',
          getKeychainAccountKey(profileName),
          '-w'
        ]
      });
      return res.code === 0 ? res.stdout.trim() : undefined;
    },
    set: async (profileName, secret) => {
      const hexSecret = Buffer.from(secret, 'utf8').toString('hex');
      const res = await execCommand({
        command: '/usr/bin/security',
        args: ['-i'],
        stdin: `add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${getKeychainAccountKey(profileName)} -X ${hexSecret}\n`
      });
      // `security -i` 批处理内部命令报错时进程退出码仍可能为 0，需一并检查 stderr。
      return res.code === 0 && res.stderr.trim().length === 0;
    },
    delete: async (profileName) => {
      await execCommand({
        command: '/usr/bin/security',
        args: [
          'delete-generic-password',
          '-s',
          KEYCHAIN_SERVICE,
          '-a',
          getKeychainAccountKey(profileName)
        ]
      });
    }
  };
}
