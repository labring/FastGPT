import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { execSystemCommand, type ExecCommandFn } from '../../src/infra/secrets/exec-command';
import { createDefaultSecretStore } from '../../src/infra/secrets/secret-store';
import { CliArgumentError, CliAuthError } from '../../src/shared/errors';

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-sec-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('SecretStore strategies', () => {
  it('stores and reads credentials in 0600 file mode and rejects permissive files', async () => {
    const dir = await makeTempDir();
    const store = createDefaultSecretStore({
      configDir: dir,
      env: { FASTGPT_SECRET_STORE: 'file' }
    });

    expect(await store.getBackendName()).toBe('file');
    expect(await store.getSecret('default')).toBeUndefined();
    // 原型链键名（如 toString/constructor）不能误匹配为密钥。
    expect(await store.getSecret('toString')).toBeUndefined();
    expect(await store.getSecret('constructor')).toBeUndefined();

    const saved = await store.setSecret('default', 'fastgpt-secret-1234');
    expect(saved.backend).toBe('file');
    expect(await store.getSecret('default')).toBe('fastgpt-secret-1234');

    const credPath = join(dir, 'credentials.json');
    if (process.platform !== 'win32') {
      expect((await stat(credPath)).mode & 0o777).toBe(0o600);
      await chmod(credPath, 0o644);
      await expect(store.getSecret('default')).rejects.toThrow(CliAuthError);
      await chmod(credPath, 0o600);
    }

    await store.deleteSecret('default');
    expect(await store.getSecret('default')).toBeUndefined();

    await writeFile(credPath, '{bad json', { mode: 0o600 });
    await expect(store.getSecret('default')).rejects.toThrow(CliArgumentError);
  });

  it('stores macOS secrets via security -i stdin hex without leaking secret in argv and cleans fallback', async () => {
    const dir = await makeTempDir();
    const calls: Array<{ command: string; args: string[]; stdin?: string }> = [];
    const keychainMap = new Map<string, string>();

    const execCommand: ExecCommandFn = async (params) => {
      calls.push(params);
      if (params.args[0] === 'default-keychain') {
        return { code: 0, stdout: 'login.keychain\n', stderr: '' };
      }
      if (params.args[0] === '-i' && params.stdin) {
        const match = params.stdin.match(/-a (\S+) -X ([0-9a-f]+)/);
        if (match) {
          keychainMap.set(match[1], Buffer.from(match[2], 'hex').toString('utf8'));
        }
        return { code: 0, stdout: '', stderr: '' };
      }
      if (params.args[0] === 'find-generic-password') {
        const account = params.args[params.args.indexOf('-a') + 1];
        const val = keychainMap.get(account);
        return val
          ? { code: 0, stdout: `${val}\n`, stderr: '' }
          : { code: 44, stdout: '', stderr: 'not found' };
      }
      if (params.args[0] === 'delete-generic-password') {
        const account = params.args[params.args.indexOf('-a') + 1];
        keychainMap.delete(account);
        return { code: 0, stdout: '', stderr: '' };
      }
      return { code: 1, stdout: '', stderr: '' };
    };

    await writeFile(join(dir, 'credentials.json'), JSON.stringify({ prod: 'stale-secret' }), {
      mode: 0o600
    });

    const store = createDefaultSecretStore({
      configDir: dir,
      env: {},
      platform: 'darwin',
      execCommand
    });

    const secret = 'fastgpt-super-secret-value';
    const result = await store.setSecret('prod', secret);
    expect(result.backend).toBe('keychain');
    expect(await store.getSecret('prod')).toBe(secret);

    for (const call of calls) {
      expect(call.args.join(' ')).not.toContain(secret);
    }

    const fileAfter = JSON.parse(await readFile(join(dir, 'credentials.json'), 'utf8'));
    expect(fileAfter.prod).toBeUndefined();

    await store.deleteSecret('prod');
    expect(await store.getSecret('prod')).toBeUndefined();
  });

  it('uses Linux secret-tool when DBus is present and falls back cleanly when absent', async () => {
    const dir = await makeTempDir();
    const warnings: string[] = [];

    const headlessStore = createDefaultSecretStore({
      configDir: dir,
      env: {},
      platform: 'linux',
      execCommand: vi.fn(async () => ({ code: 0, stdout: 'secret-tool 0.20', stderr: '' })),
      onFallbackWarning: (reason) => warnings.push(reason)
    });
    expect(await headlessStore.getBackendName()).toBe('file');
    expect((await headlessStore.setSecret('ci', 'tok-1')).backend).toBe('file');
    expect(warnings).toHaveLength(1);

    const linuxMap = new Map<string, string>();
    const dbusStore = createDefaultSecretStore({
      configDir: dir,
      env: { DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus' },
      platform: 'linux',
      execCommand: async ({ args, stdin }) => {
        if (args[0] === '--help') return { code: 1, stdout: '', stderr: '' };
        const account = args[args.indexOf('account') + 1];
        if (args[0] === 'store' && stdin !== undefined) {
          linuxMap.set(account, stdin);
          return { code: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'lookup') {
          const val = linuxMap.get(account);
          return val ? { code: 0, stdout: val, stderr: '' } : { code: 1, stdout: '', stderr: '' };
        }
        if (args[0] === 'clear') {
          linuxMap.delete(account);
          return { code: 0, stdout: '', stderr: '' };
        }
        return { code: 1, stdout: '', stderr: '' };
      }
    });

    expect(await dbusStore.getBackendName()).toBe('keychain');
    expect((await dbusStore.setSecret('desktop', 'tok-linux')).backend).toBe('keychain');
    expect(await dbusStore.getSecret('desktop')).toBe('tok-linux');
    await dbusStore.deleteSecret('desktop');
    expect(await dbusStore.getSecret('desktop')).toBeUndefined();
  });

  it('clears stale primary secrets on fallback, survives cleanup errors, and tracks actual backend per profile', async () => {
    const dir = await makeTempDir();
    const keychainMap = new Map<string, string>([['profile:prod', 'stale-keychain-secret']]);
    let failKeychainWrite = true;

    const execCommand: ExecCommandFn = async (params) => {
      if (params.args[0] === 'default-keychain') {
        return { code: 0, stdout: 'login.keychain\n', stderr: '' };
      }
      if (params.args[0] === '-i') {
        if (failKeychainWrite) {
          return { code: 0, stdout: '', stderr: 'security: User interaction is not allowed.' };
        }
        const match = params.stdin?.match(/-a (\S+) -X ([0-9a-f]+)/);
        if (match) {
          keychainMap.set(match[1], Buffer.from(match[2], 'hex').toString('utf8'));
        }
        return { code: 0, stdout: '', stderr: '' };
      }
      if (params.args[0] === 'find-generic-password') {
        const account = params.args[params.args.indexOf('-a') + 1];
        const val = keychainMap.get(account);
        return val
          ? { code: 0, stdout: `${val}\n`, stderr: '' }
          : { code: 44, stdout: '', stderr: 'not found' };
      }
      if (params.args[0] === 'delete-generic-password') {
        const account = params.args[params.args.indexOf('-a') + 1];
        keychainMap.delete(account);
        return { code: 0, stdout: '', stderr: '' };
      }
      return { code: 1, stdout: '', stderr: '' };
    };

    const warnings: string[] = [];
    const store = createDefaultSecretStore({
      configDir: dir,
      env: {},
      platform: 'darwin',
      execCommand,
      onFallbackWarning: (reason) => warnings.push(reason)
    });

    // 1. Keychain 写失败降级到文件时，必须清理主存储中的旧值，且 getBackendName(prod) 如实返回 file。
    const fallbackRes = await store.setSecret('prod', 'fresh-file-secret');
    expect(fallbackRes.backend).toBe('file');
    expect(keychainMap.has('profile:prod')).toBe(false);
    expect(await store.getSecret('prod')).toBe('fresh-file-secret');
    expect(await store.getBackendName('prod')).toBe('file');

    // 2. 即使旧 credentials.json 权限为 0644，主存储写入成功后也不应阻断登录主流程。
    failKeychainWrite = false;
    if (process.platform !== 'win32') {
      await chmod(join(dir, 'credentials.json'), 0o644);
    }
    const recoveredRes = await store.setSecret('prod', 'new-keychain-secret');
    expect(recoveredRes.backend).toBe('keychain');
    expect(await store.getSecret('prod')).toBe('new-keychain-secret');
    expect(await store.getBackendName('prod')).toBe('keychain');
    if (process.platform !== 'win32') {
      expect(warnings.some((w) => w.includes('cleaning stale credentials.json'))).toBe(true);
    }
  });

  it('handles missing executables with stdin without EPIPE crashes and enforces command timeouts', async () => {
    const missing = await execSystemCommand({
      command: 'fastgpt-definitely-missing-binary-xyz',
      args: [],
      stdin: 'secret-payload\n'
    });
    expect(missing.code).toBe(127);

    const timedOut = await execSystemCommand({
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 5000)'],
      timeoutMs: 50
    });
    expect(timedOut.code).toBe(124);
    expect(timedOut.stderr).toContain('timed out');
  });

  it('prevents recovered keychain from shadowing newer file credentials (authoritative backend tracking)', async () => {
    const dir = await makeTempDir();
    const keychainMap = new Map<string, string>([['profile:staging', 'old-keychain-A']]);
    let keychainBlocked = true;

    const execCommand: ExecCommandFn = async (params) => {
      if (params.args[0] === 'default-keychain') {
        return { code: 0, stdout: 'login.keychain\n', stderr: '' };
      }
      if (keychainBlocked) {
        // 模拟 Keychain 处于锁定状态，读写删除均受阻
        return { code: 1, stdout: '', stderr: 'security: User interaction is not allowed.' };
      }
      if (params.args[0] === '-i') {
        const match = params.stdin?.match(/-a (\S+) -X ([0-9a-f]+)/);
        if (match) {
          keychainMap.set(match[1], Buffer.from(match[2], 'hex').toString('utf8'));
        }
        return { code: 0, stdout: '', stderr: '' };
      }
      if (params.args[0] === 'find-generic-password') {
        const account = params.args[params.args.indexOf('-a') + 1];
        const val = keychainMap.get(account);
        return val
          ? { code: 0, stdout: `${val}\n`, stderr: '' }
          : { code: 44, stdout: '', stderr: 'not found' };
      }
      if (params.args[0] === 'delete-generic-password') {
        const account = params.args[params.args.indexOf('-a') + 1];
        keychainMap.delete(account);
        return { code: 0, stdout: '', stderr: '' };
      }
      return { code: 1, stdout: '', stderr: '' };
    };

    const store = createDefaultSecretStore({
      configDir: dir,
      env: {},
      platform: 'darwin',
      execCommand
    });

    // 1. Keychain 阻塞时写入新凭据 B，降级落盘到文件
    const setRes = await store.setSecret('staging', 'fresh-secret-B');
    expect(setRes.backend).toBe('file');
    expect(await store.getSecret('staging')).toBe('fresh-secret-B');
    expect(await store.getBackendName('staging')).toBe('file');

    // 2. 模拟 Keychain 恢复（此时 Keychain 中仍残留旧项 A）
    keychainBlocked = false;

    // 3. 读取时必须根据权威记录返回 B，而不是返回已陈旧的 A
    expect(await store.getSecret('staging')).toBe('fresh-secret-B');
    expect(await store.getBackendName('staging')).toBe('file');
    // 读取过程中顺带清理掉了已失效的 Keychain 项 A
    expect(keychainMap.has('profile:staging')).toBe(false);
  });
});
