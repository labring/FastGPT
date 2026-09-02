import { afterEach, describe, expect, it, vi } from 'vitest';

async function readSeccompConfig(disableValue: string | undefined) {
  vi.resetModules();
  vi.stubEnv('SANDBOX_DISABLE_SECCOMP', disableValue);
  const { getSeccompConfig } = await import('../../src/isolated/seccomp-config');
  return getSeccompConfig();
}

describe('getSeccompConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('未配置时默认启用 seccomp', async () => {
    await expect(readSeccompConfig(undefined)).resolves.toEqual({ enableSeccomp: true });
  });

  it('显式配置 false 时保持 seccomp 启用', async () => {
    await expect(readSeccompConfig('false')).resolves.toEqual({ enableSeccomp: true });
  });

  it('只有显式 truthy 配置才禁用 seccomp', async () => {
    await expect(readSeccompConfig('true')).resolves.toEqual({ enableSeccomp: false });
    await expect(readSeccompConfig('1')).resolves.toEqual({ enableSeccomp: false });
  });

  it('拼写错误不会意外禁用 seccomp', async () => {
    await expect(readSeccompConfig('treu')).resolves.toEqual({ enableSeccomp: true });
  });
});
