import { describe, expect, it, vi } from 'vitest';
import { runAgentSandboxEntrypoint } from '@fastgpt/service/core/ai/sandbox/runtime/entrypoint';
import { runAgentSkillVersionEntrypoints } from '@fastgpt/service/core/ai/skill/runtime/entrypoint';
import type { DeployedSkillVersion } from '@fastgpt/service/core/ai/skill/runtime';

type ExecuteResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated?: boolean;
};

const createSandbox = ({
  initialState,
  entrypointExitCode = 0,
  entrypointThrows = false
}: {
  initialState?: Record<string, unknown>;
  entrypointExitCode?: number;
  entrypointThrows?: boolean;
} = {}) => {
  let stateContent = initialState ? JSON.stringify(initialState) : undefined;

  const sandbox = {
    execute: vi.fn(async (command: string): Promise<ExecuteResult> => {
      if (command === 'printf "%s" "$HOME"') {
        return { exitCode: 0, stdout: '/home/test', stderr: '' };
      }
      if (command.startsWith("mkdir -p '/home/test/.fastgpt/runtime'")) {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (command.startsWith("[ -f '/workspace/projects/version-1/entrypoint.sh' ]")) {
        return { exitCode: 0, stdout: '', stderr: '' };
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
  targetDir: '/workspace/projects/version-1'
};

const isSandboxEntrypointCommand = (command: string) =>
  command.includes('base64 -d | /bin/bash') && command.includes('tail -c 8192');

const isSkillEntrypointCommand = (command: string) =>
  command.startsWith("cd '/workspace/projects/version-1' && /bin/bash -c ") &&
  command.includes('entrypoint.sh') &&
  command.includes('tail -c 8192');

describe('runtime entrypoint', () => {
  it('skips empty sandbox entrypoint', async () => {
    const sandbox = createSandbox();

    await runAgentSandboxEntrypoint({
      sandbox: sandbox as any,
      sandboxEntrypoint: '   '
    });

    expect(sandbox.execute).not.toHaveBeenCalled();
  });

  it('skips sandbox entrypoint when the current script hash matches and overwrites after changes', async () => {
    const sandbox = createSandbox();

    await runAgentSandboxEntrypoint({
      sandbox: sandbox as any,
      sandboxEntrypoint: 'echo first'
    });
    const firstHash = sandbox.getState()?.hashes?.sandboxEntrypoint;

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
    expect(sandbox.getState()?.hashes?.sandboxEntrypoint).toMatch(/^sha256:/);
    expect(sandbox.getState()?.hashes?.sandboxEntrypoint).not.toBe(firstHash);
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

    expect(sandbox.getState()?.hashes?.sandboxEntrypoint).toBeUndefined();
  });

  it('does not throw or write state when sandbox entrypoint execution throws', async () => {
    const sandbox = createSandbox({ entrypointThrows: true });

    await expect(
      runAgentSandboxEntrypoint({
        sandbox: sandbox as any,
        sandboxEntrypoint: 'echo throw'
      })
    ).resolves.toBeUndefined();
    expect(sandbox.getState()?.hashes?.sandboxEntrypoint).toBeUndefined();
  });

  it('uses skill version state to skip successful skill entrypoints', async () => {
    const sandbox = createSandbox();

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

    expect(runCommands).toHaveLength(1);
    expect(sandbox.getState()?.lists?.skillEntrypoints).toEqual(['version-1']);
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
    expect(sandbox.getState()?.lists?.skillEntrypoints).toBeUndefined();
  });
});
