import { describe, expect, it, vi } from 'vitest';
import {
  runAgentSandboxEntrypoint,
  runAgentSkillVersionEntrypoints
} from '@fastgpt/service/core/ai/skill/runtime/entrypoint';
import type { DeployedSkillVersion } from '@fastgpt/service/core/ai/skill/runtime';

type ExecuteResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated?: boolean;
};

const createSandbox = ({
  initialState,
  entrypointExists = true,
  entrypointExitCode = 0,
  entrypointThrows = false,
  homeAvailable = true,
  lockAvailable = true,
  writeStateFails = false
}: {
  initialState?: Record<string, unknown>;
  entrypointExists?: boolean;
  entrypointExitCode?: number;
  entrypointThrows?: boolean;
  homeAvailable?: boolean;
  lockAvailable?: boolean;
  writeStateFails?: boolean;
} = {}) => {
  let stateContent = initialState ? JSON.stringify(initialState) : undefined;
  const statePath = '/home/test/.fastgpt/agent-skill-entrypoints/state.json';

  const sandbox = {
    execute: vi.fn(async (command: string): Promise<ExecuteResult> => {
      if (command === 'printf "%s" "$HOME"') {
        return homeAvailable
          ? { exitCode: 0, stdout: '/home/test', stderr: '' }
          : { exitCode: 0, stdout: '', stderr: '' };
      }
      if (command === 'sh -c "echo ~"') {
        return homeAvailable
          ? { exitCode: 0, stdout: '/home/test', stderr: '' }
          : { exitCode: 1, stdout: '', stderr: 'no home' };
      }
      if (command.startsWith("mkdir -p '/home/test/.fastgpt/agent-skill-entrypoints'")) {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (isAcquireLockCommand(command)) {
        return lockAvailable
          ? { exitCode: 0, stdout: '', stderr: '' }
          : { exitCode: 1, stdout: '', stderr: 'busy' };
      }
      if (isReleaseLockCommand(command)) {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (command.startsWith("[ -f '/workspace/projects/version-1/entrypoint.sh' ]")) {
        return { exitCode: entrypointExists ? 0 : 1, stdout: '', stderr: '' };
      }
      if (isSkillEntrypointCommand(command) || isSandboxEntrypointCommand(command)) {
        if (entrypointThrows) {
          throw new Error('execute failed');
        }
        return { exitCode: entrypointExitCode, stdout: 'ok', stderr: '' };
      }
      throw new Error(`Unexpected command: ${command}`);
    }),
    readFiles: vi.fn(async (paths: string[]) =>
      paths.map((path) => ({
        path,
        content: Buffer.from(stateContent || ''),
        error: stateContent ? null : new Error('not found')
      }))
    ),
    writeFiles: vi.fn(async (entries: Array<{ path: string; data: string }>) => {
      if (writeStateFails) {
        return entries.map((entry) => ({
          path: entry.path,
          bytesWritten: 0,
          error: new Error('write failed')
        }));
      }

      stateContent = String(entries[0].data);
      return entries.map((entry) => ({
        path: entry.path,
        bytesWritten: entry.data.length,
        error: null
      }));
    }),
    getState: () => (stateContent ? JSON.parse(stateContent) : undefined)
  };

  return sandbox;
};

const version: DeployedSkillVersion = {
  versionId: 'version-1',
  targetDir: '/workspace/projects/version-1',
  freshlyDeployed: false
};

const isSandboxEntrypointCommand = (command: string) =>
  command.includes('base64 -d | /bin/bash') && command.includes('tail -c 8192');

const isSkillEntrypointCommand = (command: string) =>
  command.startsWith("cd '/workspace/projects/version-1' && /bin/bash -c ") &&
  command.includes('entrypoint.sh') &&
  command.includes('tail -c 8192');

const isAcquireLockCommand = (command: string) =>
  command.startsWith('/bin/bash -c ') &&
  command.includes('/home/test/.fastgpt/agent-skill-entrypoints/.lock') &&
  command.includes('deadline=') &&
  command.includes('mkdir "$lock_dir"');

const isReleaseLockCommand = (command: string) =>
  command.startsWith('/bin/bash -c ') &&
  command.includes('/home/test/.fastgpt/agent-skill-entrypoints/.lock') &&
  command.includes('cat "$lock_dir/owner"');

describe('runtime entrypoint', () => {
  it('skips empty sandbox entrypoint', async () => {
    const sandbox = createSandbox();

    await runAgentSandboxEntrypoint({
      sandbox: sandbox as any,
      sandboxEntrypoint: '   '
    });

    expect(sandbox.execute).not.toHaveBeenCalled();
  });

  it('runs sandbox entrypoint once per script hash and reruns after script changes', async () => {
    const sandbox = createSandbox();

    await runAgentSandboxEntrypoint({
      sandbox: sandbox as any,
      sandboxEntrypoint: 'echo first'
    });
    await runAgentSandboxEntrypoint({
      sandbox: sandbox as any,
      sandboxEntrypoint: 'echo first'
    });
    await runAgentSandboxEntrypoint({
      sandbox: sandbox as any,
      sandboxEntrypoint: 'echo second'
    });

    const entrypointCommands = sandbox.execute.mock.calls
      .map(([command]) => command)
      .filter(isSandboxEntrypointCommand);

    expect(entrypointCommands).toHaveLength(2);
    expect(sandbox.getState()?.sandboxEntrypointHashes).toHaveLength(2);
  });

  it('runs sandbox entrypoint from the configured work directory', async () => {
    const sandbox = createSandbox();

    await runAgentSandboxEntrypoint({
      sandbox: sandbox as any,
      sandboxEntrypoint: 'pwd',
      workDirectory: '/workspace'
    });

    const entrypointCommand = sandbox.execute.mock.calls
      .map(([command]) => command)
      .find(isSandboxEntrypointCommand);
    expect(entrypointCommand).toMatch(/^cd '\/workspace' && \/bin\/bash -c /);
  });

  it('does not write sandbox entrypoint state when execution fails', async () => {
    const sandbox = createSandbox({ entrypointExitCode: 1 });

    await runAgentSandboxEntrypoint({
      sandbox: sandbox as any,
      sandboxEntrypoint: 'exit 1'
    });

    expect(sandbox.getState()?.sandboxEntrypointHashes).toBeUndefined();
  });

  it('does not throw or write state when sandbox entrypoint execution throws', async () => {
    const sandbox = createSandbox({ entrypointThrows: true });

    await expect(
      runAgentSandboxEntrypoint({
        sandbox: sandbox as any,
        sandboxEntrypoint: 'echo throw'
      })
    ).resolves.toBeUndefined();
    expect(sandbox.getState()?.sandboxEntrypointHashes).toBeUndefined();
  });

  it('uses skill version state to skip successful skill entrypoints and reruns fresh deploys', async () => {
    const sandbox = createSandbox();

    await runAgentSkillVersionEntrypoints({
      sandbox: sandbox as any,
      versions: [version]
    });
    await runAgentSkillVersionEntrypoints({
      sandbox: sandbox as any,
      versions: [version]
    });
    await runAgentSkillVersionEntrypoints({
      sandbox: sandbox as any,
      versions: [
        {
          ...version,
          freshlyDeployed: true
        }
      ]
    });

    const runCommands = sandbox.execute.mock.calls
      .map(([command]) => command)
      .filter(isSkillEntrypointCommand);

    expect(runCommands).toHaveLength(2);
    expect(sandbox.getState()?.skillEntrypoints).toEqual(['version-1']);
  });

  it('removes stale skill state when a freshly deployed entrypoint fails', async () => {
    const sandbox = createSandbox({
      initialState: {
        skillEntrypoints: ['version-1']
      },
      entrypointExitCode: 1
    });

    await runAgentSkillVersionEntrypoints({
      sandbox: sandbox as any,
      versions: [
        {
          ...version,
          freshlyDeployed: true
        }
      ]
    });

    expect(sandbox.getState()?.skillEntrypoints).toBeUndefined();
  });

  it('removes unselected skill versions from entrypoint state', async () => {
    const sandbox = createSandbox({
      initialState: {
        skillEntrypoints: ['version-1', 'version-2']
      }
    });

    await runAgentSkillVersionEntrypoints({
      sandbox: sandbox as any,
      versions: [version]
    });

    expect(sandbox.getState()?.skillEntrypoints).toEqual(['version-1']);
  });

  it('retries skill entrypoint after a failed run', async () => {
    const sandbox = createSandbox({ entrypointExitCode: 1 });

    await runAgentSkillVersionEntrypoints({
      sandbox: sandbox as any,
      versions: [version]
    });
    await runAgentSkillVersionEntrypoints({
      sandbox: sandbox as any,
      versions: [version]
    });

    const runCommands = sandbox.execute.mock.calls
      .map(([command]) => command)
      .filter(isSkillEntrypointCommand);

    expect(runCommands).toHaveLength(2);
    expect(sandbox.getState()?.skillEntrypoints).toBeUndefined();
  });
});
