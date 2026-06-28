import { describe, expect, it, vi } from 'vitest';
import { prepareSandboxRuntimeMirrors } from '@fastgpt/service/core/ai/sandbox/application/runtime/mirrors';
import { buildRuntimeHash } from '@fastgpt/service/core/ai/sandbox/utils';

const createSandbox = () => {
  let stateContent: string | undefined;
  const executedCommands: string[] = [];

  const sandbox = {
    execute: vi.fn(async (command: string) => {
      if (command === 'printf "%s" "$HOME"') {
        return { exitCode: 0, stdout: '/home/test', stderr: '' };
      }
      if (command.startsWith("mkdir -p '/home/test/.fastgpt/runtime'")) {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (command.includes("base64 -d > '/home/test/")) {
        executedCommands.push(command);
        return { exitCode: 0, stdout: '', stderr: '' };
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
      const stateEntry = entries.find((entry) =>
        entry.path.endsWith('/.fastgpt/runtime/state.json')
      );
      if (stateEntry) {
        stateContent = stateEntry.data;
      }
      return entries.map((entry) => ({
        path: entry.path,
        bytesWritten: entry.data.length,
        error: null
      }));
    }),
    getExecutedCommands: () => executedCommands,
    getState: () => (stateContent ? JSON.parse(stateContent) : undefined)
  };

  return sandbox;
};

describe('sandbox runtime mirrors', () => {
  it('executes npm, yarn, pnpm, bun, pip and uv mirror script once per hash', async () => {
    const sandbox = createSandbox();
    const expectedMirrorFiles = [
      {
        path: '.npmrc',
        content: 'registry=https://npm.example.com\n'
      },
      {
        path: '.yarnrc',
        content: 'registry "https://npm.example.com"\n'
      },
      {
        path: '.yarnrc.yml',
        content: 'npmRegistryServer: "https://npm.example.com"\n'
      },
      {
        path: '.bunfig.toml',
        content: '[install]\nregistry = "https://npm.example.com"\n'
      },
      {
        path: '.pip/pip.conf',
        content:
          '[global]\nindex-url = https://pypi.example.com/simple\ntrusted-host = pypi.example.com\n'
      },
      {
        path: '.config/pip/pip.conf',
        content:
          '[global]\nindex-url = https://pypi.example.com/simple\ntrusted-host = pypi.example.com\n'
      },
      {
        path: '.config/uv/uv.toml',
        content:
          'default-index = "https://pypi.example.com/simple"\nallow-insecure-host = ["pypi.example.com"]\n'
      }
    ];
    const expectedScript = [
      "mkdir -p '/home/test' '/home/test/.pip' '/home/test/.config/pip' '/home/test/.config/uv'",
      ...expectedMirrorFiles.map(({ path, content }) => {
        const encodedContent = Buffer.from(content, 'utf-8').toString('base64');
        return `printf %s '${encodedContent}' | base64 -d > '/home/test/${path}'`;
      })
    ].join('\n');

    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: {
        npmRegistry: 'https://npm.example.com',
        pypiIndexUrl: 'https://pypi.example.com/simple'
      }
    });
    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: {
        npmRegistry: 'https://npm.example.com',
        pypiIndexUrl: 'https://pypi.example.com/simple'
      }
    });

    expect(sandbox.getExecutedCommands()).toEqual([expectedScript]);

    expect(sandbox.getState()?.values?.sandboxPackageMirrors).toBe(
      buildRuntimeHash(expectedScript)
    );
  });
});
