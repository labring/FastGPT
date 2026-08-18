import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { resolveSandboxHome } from '@fastgpt/service/core/ai/sandbox/application/runtime/home';
import { describe, expect, it, vi } from 'vitest';

const commandResult = (exitCode: number, stdout = '') => ({
  exitCode,
  stdout,
  stderr: ''
});

describe('resolveSandboxHome', () => {
  it('shares one successful HOME lookup across concurrent and subsequent calls', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(commandResult(1))
      .mockResolvedValueOnce(commandResult(0, '/root\n'));
    const sandbox = { execute } as unknown as ISandbox;

    await expect(
      Promise.all([
        resolveSandboxHome(sandbox),
        resolveSandboxHome(sandbox),
        resolveSandboxHome(sandbox)
      ])
    ).resolves.toEqual(['/root', '/root', '/root']);
    await expect(resolveSandboxHome(sandbox)).resolves.toBe('/root');

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenLastCalledWith('sh -c \"echo ~\"', {
      timeoutMs: 5_000,
      maxOutputBytes: 1024
    });
  });

  it('retries when the previous lookup returned no HOME', async () => {
    const execute = vi.fn(async () => commandResult(1));
    const sandbox = { execute } as unknown as ISandbox;

    await expect(resolveSandboxHome(sandbox)).resolves.toBeUndefined();
    await expect(resolveSandboxHome(sandbox)).resolves.toBeUndefined();

    expect(execute).toHaveBeenCalledTimes(4);
  });
});
