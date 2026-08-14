import { describe, expect, it, vi } from 'vitest';
import { prepareSandboxRuntimeMirrors } from '@fastgpt/service/core/ai/sandbox/application/runtime/mirrors';
import { buildRuntimeHash } from '@fastgpt/service/core/ai/sandbox/utils';

const createSandbox = () => {
  let stateContent: string | undefined;
  const mirrorWrites: Array<Array<{ path: string; data: string }>> = [];

  const sandbox = {
    execute: vi.fn(async (command: string) => {
      if (command === 'printf "%s" "$HOME"') {
        return { exitCode: 0, stdout: '/home/test', stderr: '' };
      }
      throw new Error(`Unexpected command: ${command}`);
    }),
    createDirectories: vi.fn(async () => undefined),
    readFiles: vi.fn(async (paths: string[]) =>
      paths.map((path) => ({
        path,
        content: Buffer.from(stateContent || ''),
        error: stateContent ? null : new Error('not found')
      }))
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
  it('writes npm, yarn, pnpm, bun, pip and uv mirror files once per hash', async () => {
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
    const expectedWriteEntries = expectedMirrorFiles.map(({ path, content }) => ({
      path: `/home/test/${path}`,
      data: content
    }));

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

    expect(sandbox.getMirrorWrites()).toEqual([expectedWriteEntries]);
    expect(sandbox.getState()?.values?.sandboxPackageMirrors).toBe(
      buildRuntimeHash(JSON.stringify(expectedWriteEntries))
    );
  });

  it('does not commit the mirror hash when one file write fails', async () => {
    const sandbox = createSandbox();
    sandbox.writeFiles.mockResolvedValueOnce([
      {
        path: '/home/test/.npmrc',
        bytesWritten: 0,
        error: new Error('write failed')
      }
    ]);

    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: { npmRegistry: 'https://npm.example.com' }
    });

    expect(sandbox.getState()).toBeUndefined();
  });
});
