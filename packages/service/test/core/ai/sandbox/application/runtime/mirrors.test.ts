import { describe, expect, it, vi } from 'vitest';
import { prepareSandboxRuntimeMirrors } from '@fastgpt/service/core/ai/sandbox/application/runtime/mirrors';
import { buildRuntimeHash } from '@fastgpt/service/core/ai/sandbox/utils';

const createSandbox = ({
  osRelease = 'ID=ubuntu\nVERSION_CODENAME=noble\n'
}: {
  osRelease?: string;
} = {}) => {
  let stateContent: string | undefined;
  let aptSourceContent: string | undefined;
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
      paths.map((path) => {
        const content = (() => {
          if (path === '/etc/os-release') return osRelease;
          if (path === '/etc/apt/sources.list.d/00-fastgpt-mirror.sources') {
            return aptSourceContent;
          }
          return stateContent;
        })();
        return {
          path,
          content: Buffer.from(content || ''),
          error: content ? null : new Error(`File not found: ${path}`)
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
          const aptSourceEntry = entries.find(
            (entry) => entry.path === '/etc/apt/sources.list.d/00-fastgpt-mirror.sources'
          );
          if (aptSourceEntry) {
            aptSourceContent = aptSourceEntry.data;
          }
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
  it('skips sandbox calls when no package mirror is configured', async () => {
    const sandbox = createSandbox();

    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: {
        npmRegistry: ' ',
        pypiIndexUrl: '\t',
        aptMirror: ''
      }
    });

    expect(sandbox.execute).not.toHaveBeenCalled();
    expect(sandbox.readFiles).not.toHaveBeenCalled();
    expect(sandbox.writeFiles).not.toHaveBeenCalled();
  });

  it('writes all package mirror files once per hash', async () => {
    const sandbox = createSandbox();
    const expectedWriteEntries = [
      {
        path: '/home/test/.npmrc',
        data: 'registry=https://npm.example.com\n'
      },
      {
        path: '/home/test/.yarnrc',
        data: 'registry "https://npm.example.com"\n'
      },
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
      },
      {
        path: '/etc/apt/sources.list.d/00-fastgpt-mirror.sources',
        data: [
          'Types: deb',
          'URIs: https://mirror.example.com/ubuntu/',
          'Suites: noble noble-updates noble-backports noble-security',
          'Components: main restricted universe multiverse',
          'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg',
          ''
        ].join('\n')
      }
    ];

    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: {
        npmRegistry: 'https://npm.example.com',
        pypiIndexUrl: 'https://pypi.example.com/simple',
        aptMirror: ' https://mirror.example.com/ubuntu/ '
      }
    });
    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: {
        npmRegistry: 'https://npm.example.com',
        pypiIndexUrl: 'https://pypi.example.com/simple',
        aptMirror: ' https://mirror.example.com/ubuntu/ '
      }
    });

    expect(sandbox.getMirrorWrites()).toEqual([expectedWriteEntries]);
    expect(sandbox.createDirectories).not.toHaveBeenCalledWith(['/etc/apt/sources.list.d']);
    expect(sandbox.getState()?.values?.sandboxPackageMirrors).toBe(
      buildRuntimeHash(JSON.stringify(expectedWriteEntries))
    );
  });

  it('writes Debian apt sources with Debian suites and keyring', async () => {
    const sandbox = createSandbox({ osRelease: 'ID=debian\nVERSION_CODENAME=bookworm\n' });

    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: { aptMirror: 'https://mirror.example.com/debian/' }
    });

    expect(sandbox.getMirrorWrites()).toEqual([
      [
        {
          path: '/etc/apt/sources.list.d/00-fastgpt-mirror.sources',
          data: [
            'Types: deb',
            'URIs: https://mirror.example.com/debian/',
            'Suites: bookworm bookworm-updates bookworm-backports bookworm-security',
            'Components: main contrib non-free non-free-firmware',
            'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg',
            ''
          ].join('\n')
        }
      ]
    ]);
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

  it('keeps official apt sources when the sandbox image is not Ubuntu or Debian', async () => {
    const sandbox = createSandbox({ osRelease: 'ID=alpine\nVERSION_CODENAME=\n' });

    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: { aptMirror: 'https://mirror.example.com/debian' }
    });

    expect(sandbox.readFiles).toHaveBeenCalledWith(['/etc/os-release']);
    expect(sandbox.execute).toHaveBeenCalledWith('printf "%s" "$HOME"', {
      timeoutMs: 5_000,
      maxOutputBytes: 1024
    });
    expect(sandbox.getMirrorWrites()).toEqual([]);
  });

  it('keeps official apt sources when reading the sandbox OS release fails', async () => {
    const sandbox = createSandbox();
    sandbox.readFiles.mockRejectedValueOnce(new Error('read failed'));

    await expect(
      prepareSandboxRuntimeMirrors({
        sandbox: sandbox as any,
        config: { aptMirror: 'https://mirror.example.com/ubuntu' }
      })
    ).resolves.toBeUndefined();

    expect(sandbox.execute).toHaveBeenCalledWith('printf "%s" "$HOME"', {
      timeoutMs: 5_000,
      maxOutputBytes: 1024
    });
    expect(sandbox.getMirrorWrites()).toEqual([]);
  });
});
