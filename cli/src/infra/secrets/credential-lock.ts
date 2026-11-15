import { join } from 'node:path';
import lockfile from 'proper-lockfile';
import { ensureSecureDir } from '../config/config-repository';

/**
 * 同一配置目录的 Keychain / 文件元数据共享一把跨进程锁，保护凭证对和配置读改写。
 * 心跳续租与崩溃恢复由 proper-lockfile 处理；回调落盘前必须检查租约仍有效。
 */
export const withCredentialLock = async <T>({
  configDir,
  fn
}: {
  configDir: string;
  fn: (assertValid: () => void) => Promise<T>;
}): Promise<T> => {
  await ensureSecureDir(configDir);
  let compromised: Error | undefined;
  const release = await lockfile.lock(join(configDir, '.credential-operation'), {
    realpath: false,
    stale: 60_000,
    update: 10_000,
    retries: { retries: 60, minTimeout: 50, maxTimeout: 250, factor: 1.1 },
    onCompromised: (error) => {
      compromised = error;
    }
  });
  const assertValid = () => {
    if (compromised) throw compromised;
  };
  try {
    assertValid();
    const result = await fn(assertValid);
    assertValid();
    return result;
  } finally {
    await release();
  }
};
