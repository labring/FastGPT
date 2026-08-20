import { describe, expect, it, vi } from 'vitest';
import { prepareSandboxRuntimeMirrors } from '@fastgpt/service/core/ai/sandbox/application/runtime/mirrors';
import { buildRuntimeHash } from '@fastgpt/service/core/ai/sandbox/utils';

const createSandbox = () => {
  let stateContent: string | undefined;
  const mirrorWrites: Array<Array<{ path: string; data: string }>> = [];
  const files = new Map<string, string>();

  const sandbox = {
    execute: vi.fn(async (command: string) => {
      if (command === 'printf "%s" "$HOME"') {
        return { exitCode: 0, stdout: '/home/test', stderr: '' };
      }
      throw new Error(`Unexpected command: ${command}`);
    }),
    createDirectories: vi.fn(async () => undefined),
    readFiles: vi.fn(async (paths: string[]) =>
      paths.map((path) => {
        const content = path.endsWith('/.fastgpt/runtime/state.json')
          ? stateContent
          : files.get(path);
        return {
          path,
          content: Buffer.from(content ?? ''),
          error: content === undefined ? new Error(`File not found: ${path}`) : null
        };
      })
    ),
    writeFiles: vi.fn(
      async (
        entries: Array<{ path: string; data: string }>
      ): Promise<Array<{ path: string; bytesWritten: number; error: Error | null }>> => {
        const stateEntry = entries.find((entry) =>
          entry.path.endsWith('/.fastgpt/runtime/state.json')
        );
        if (stateEntry) {
          stateContent = stateEntry.data;
        } else {
          mirrorWrites.push(entries);
          entries.forEach((entry) => files.set(entry.path, entry.data));
        }
        return entries.map((entry) => ({
          path: entry.path,
          bytesWritten: entry.data.length,
          error: null
        }));
      }
    ),
    getMirrorWrites: () => mirrorWrites,
    getState: () => (stateContent ? JSON.parse(stateContent) : undefined)
  };

  return sandbox;
};

describe('sandbox runtime mirrors', () => {
  it('synchronizes npm and pypi mirror groups independently', async () => {
    const sandbox = createSandbox();
    const config = {
      npmRegistry: 'https://npm.example.com',
      pypiIndexUrl: 'https://pypi.example.com/simple'
    };
    const expectedWriteEntries = [
      { path: '/home/test/.npmrc', data: 'registry=https://npm.example.com\n' },
      { path: '/home/test/.yarnrc', data: 'registry "https://npm.example.com"\n' },
      {
        path: '/home/test/.yarnrc.yml',
        data: 'npmRegistryServer: "https://npm.example.com"\n'
      },
      {
        path: '/home/test/.bunfig.toml',
        data: '[install]\nregistry = "https://npm.example.com"\n'
      },
      {
        path: '/home/test/.pip/pip.conf',
        data: '[global]\nindex-url = https://pypi.example.com/simple\ntrusted-host = pypi.example.com\n'
      },
      {
        path: '/home/test/.config/pip/pip.conf',
        data: '[global]\nindex-url = https://pypi.example.com/simple\ntrusted-host = pypi.example.com\n'
      },
      {
        path: '/home/test/.config/uv/uv.toml',
        data: 'default-index = "https://pypi.example.com/simple"\nallow-insecure-host = ["pypi.example.com"]\n'
      }
    ];

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config });
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config });

    expect(sandbox.getMirrorWrites()).toEqual([
      expectedWriteEntries.slice(0, 4),
      expectedWriteEntries.slice(4)
    ]);
    expect(sandbox.getState()?.values).toEqual({
      npmMirror: buildRuntimeHash(config.npmRegistry),
      pypiMirror: buildRuntimeHash(config.pypiIndexUrl),
      aptMirror: buildRuntimeHash('')
    });

    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: {
        npmRegistry: 'https://another-npm.example.com',
        pypiIndexUrl: config.pypiIndexUrl
      }
    });

    expect(sandbox.getMirrorWrites()).toHaveLength(3);
    expect(
      sandbox
        .getMirrorWrites()[2]
        .map(({ path }) => path)
        .slice(-4)
    ).toEqual([
      '/home/test/.npmrc',
      '/home/test/.yarnrc',
      '/home/test/.yarnrc.yml',
      '/home/test/.bunfig.toml'
    ]);
    expect(sandbox.getState()?.values).toEqual({
      npmMirror: buildRuntimeHash('https://another-npm.example.com'),
      pypiMirror: buildRuntimeHash(config.pypiIndexUrl),
      aptMirror: buildRuntimeHash('')
    });
  });

  it('keeps retrying apt platform resolution without blocking other mirrors', async () => {
    const sandbox = createSandbox();
    const config = {
      npmRegistry: 'https://npm.example.com',
      aptMirror: 'https://apt.example.com/ubuntu'
    };

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config });
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config });

    expect(sandbox.getMirrorWrites()).toHaveLength(1);
    expect(sandbox.getState()?.values).toEqual({
      npmMirror: buildRuntimeHash(config.npmRegistry),
      pypiMirror: buildRuntimeHash('')
    });
    expect(
      sandbox.readFiles.mock.calls.filter(([paths]) => paths.includes('/etc/os-release'))
    ).toHaveLength(2);
  });
});
