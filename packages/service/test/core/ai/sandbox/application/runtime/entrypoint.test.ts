import { describe, expect, it, vi } from 'vitest';
import { type ExecuteResult } from '@fastgpt-sdk/sandbox-adapter';
import { LeaseCache, RedisLeaseUnavailableError } from '@fastgpt/dal/redis/caches';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import {
  runAgentSandboxEntrypoint,
  withAgentSandboxInitLease
} from '@fastgpt/service/core/ai/sandbox/application/runtime/entrypoint';
import { runAgentSkillVersionEntrypoints } from '@fastgpt/service/core/ai/sandbox/application/runtime/skill/entrypoint';

/** 用可恢复的执行结果和持久化内容模拟同一个 Sandbox，验证多次初始化的实际行为。 */
const createSandbox = (initialState?: Record<string, unknown>) => {
  let stateContent = initialState ? JSON.stringify(initialState) : undefined;
  const execution = { exitCode: 0, throws: false };
  return {
    execution,
    execute: vi.fn(
      async (command: string, _options?: { workingDirectory?: string }): Promise<ExecuteResult> => {
        if (command === 'printf "%s" "$HOME"') {
          return { exitCode: 0, stdout: '/home/test', stderr: '' };
        }
        if (execution.throws) throw new Error('execute failed');
        return { exitCode: execution.exitCode, stdout: 'ok', stderr: '' };
      }
    ),
    createDirectories: vi.fn(async () => undefined),
    getFileInfo: vi.fn(
      async (paths: string[]) => new Map(paths.map((path) => [path, { isFile: true }]))
    ),
    readFiles: vi.fn(async (paths: string[]) =>
      paths.map((path) => ({
        path,
        content: Buffer.from(stateContent ?? ''),
        error: stateContent === undefined ? new Error('not found') : null
      }))
    ),
    writeFiles: vi.fn(
      async (
        entries: Array<{ path: string; data: string }>
      ): Promise<Array<{ path: string; bytesWritten: number; error: Error | null }>> => {
        stateContent = entries[0].data;
        return entries.map((entry) => ({
          path: entry.path,
          bytesWritten: entry.data.length,
          error: null
        }));
      }
    ),
    getState: () => (stateContent === undefined ? undefined : JSON.parse(stateContent))
  };
};

const version = { versionId: 'version-1', targetDir: '/workspace/projects/version-1' };
const startupCalls = (sandbox: ReturnType<typeof createSandbox>) =>
  sandbox.execute.mock.calls.filter(([command]) => command !== 'printf "%s" "$HOME"');

describe('runtime entrypoint', () => {
  it('initializes parent and child nodes independently, skips unchanged scripts and reruns edits', async () => {
    const sandbox = createSandbox();
    const params = { sandbox: sandbox as any, workDirectory: '/workspace' };
    await runAgentSandboxEntrypoint({ ...params, scope: 'parent', sandboxEntrypoint: ' ' });
    expect(sandbox.execute).not.toHaveBeenCalled();

    for (const scope of ['parent', 'child', 'parent', 'child']) {
      await runAgentSandboxEntrypoint({ ...params, scope, sandboxEntrypoint: `echo ${scope}` });
    }
    expect(startupCalls(sandbox)).toHaveLength(2);
    const childHash = sandbox.getState().values['sandboxEntrypoint:child'];
    await runAgentSandboxEntrypoint({
      ...params,
      scope: 'parent',
      sandboxEntrypoint: 'echo edited'
    });

    expect(startupCalls(sandbox)).toHaveLength(3);
    for (const [index, script] of ['echo parent', 'echo child', 'echo edited'].entries()) {
      expect(startupCalls(sandbox)[index][0]).toContain(Buffer.from(script).toString('base64'));
    }
    expect(
      startupCalls(sandbox).every(([, options]) => options?.workingDirectory === '/workspace')
    ).toBe(true);
    expect(sandbox.getState().values).toEqual({
      'sandboxEntrypoint:parent': expect.any(String),
      'sandboxEntrypoint:child': childHash
    });
  });

  it('retries failed skill initialization while preserving successful versions across selections', async () => {
    const sandbox = createSandbox({ values: { skillEntrypoints: ['cached-version'] } });
    const second = { versionId: 'version-2', targetDir: '/workspace/projects/version-2' };
    await runAgentSkillVersionEntrypoints({ sandbox: sandbox as any, versions: [version] });

    sandbox.execution.exitCode = 1;
    await runAgentSkillVersionEntrypoints({ sandbox: sandbox as any, versions: [second] });
    expect(sandbox.getState().values.skillEntrypoints).toEqual([
      'cached-version',
      version.versionId
    ]);

    sandbox.execution.exitCode = 0;
    await runAgentSkillVersionEntrypoints({ sandbox: sandbox as any, versions: [second, version] });
    await runAgentSkillVersionEntrypoints({ sandbox: sandbox as any, versions: [version, second] });
    expect(sandbox.getState().values.skillEntrypoints).toEqual([
      'cached-version',
      version.versionId,
      second.versionId
    ]);
    expect(startupCalls(sandbox).map(([, options]) => options?.workingDirectory)).toEqual([
      version.targetDir,
      second.targetDir,
      second.targetDir
    ]);
  });

  it('keeps script failures non-blocking and records success only after a successful retry', async () => {
    const sandbox = createSandbox();
    const params = { sandbox: sandbox as any, scope: 'parent', sandboxEntrypoint: 'echo start' };
    sandbox.execution.exitCode = 1;
    await runAgentSandboxEntrypoint(params);
    sandbox.execution.throws = true;
    await runAgentSandboxEntrypoint(params);
    expect(sandbox.getState()).toBeUndefined();

    sandbox.execution.exitCode = 0;
    sandbox.execution.throws = false;
    await runAgentSandboxEntrypoint(params);
    await runAgentSandboxEntrypoint(params);
    expect(startupCalls(sandbox)).toHaveLength(3);
    expect(sandbox.writeFiles).toHaveBeenCalledOnce();
  });

  it('serializes concurrent initializations on a shared sandboxId and times out when the lock never releases', async () => {
    const heldKeys = new Set<string>();
    const withLeaseSpy = vi
      .spyOn(LeaseCache.prototype, 'withLease')
      .mockImplementation(async ({ key, label, fn }) => {
        if (heldKeys.has(key)) throw new RedisLeaseUnavailableError({ key, label });
        heldKeys.add(key);
        try {
          return await fn({ signal: new AbortController().signal, assertValid: () => undefined });
        } finally {
          heldKeys.delete(key);
        }
      });

    try {
      const order: string[] = [];
      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      const runWithLease = (name: string, wait?: Promise<void>) =>
        withAgentSandboxInitLease({
          sandboxId: 'shared-root-sandbox',
          retryIntervalMs: 10,
          fn: async () => {
            order.push(`${name}:start`);
            await wait;
            order.push(`${name}:end`);
            return `${name}-done`;
          }
        });

      const firstPromise = runWithLease('first', firstGate);
      const secondPromise = runWithLease('second');
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
      expect(order).toEqual(['first:start']);
      releaseFirst();

      await expect(Promise.all([firstPromise, secondPromise])).resolves.toEqual([
        'first-done',
        'second-done'
      ]);
      expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);

      heldKeys.add('agent-sandbox:init:stuck-sandbox');
      await expect(
        withAgentSandboxInitLease({
          sandboxId: 'stuck-sandbox',
          waitTimeoutMs: 25,
          retryIntervalMs: 10,
          fn: async () => 'unreachable'
        })
      ).rejects.toThrow(SandboxErrEnum.agentSandboxInitializing);
    } finally {
      withLeaseSpy.mockRestore();
    }
  });
});
