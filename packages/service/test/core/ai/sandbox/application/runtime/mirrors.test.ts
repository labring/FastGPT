import { describe, expect, it, vi } from 'vitest';
import { prepareSandboxRuntimeMirrors } from '@fastgpt/service/core/ai/sandbox/application/runtime/mirrors';
import { buildRuntimeHash } from '@fastgpt/service/core/ai/sandbox/utils';

const createSandbox = (initialFiles: Record<string, string> = {}) => {
  let stateContent: string | undefined;
  const mirrorWrites: Array<Array<{ path: string; data: string }>> = [];
  const files = new Map(Object.entries(initialFiles));

  const sandbox = {
    execute: vi.fn(async (command: string) => {
      if (command === 'printf "%s" "$HOME"') {
        return { exitCode: 0, stdout: '/home/test', stderr: '' };
      }
      throw new Error(`Unexpected command: ${command}`);
    }),
    createDirectories: vi.fn(async () => undefined),
    getFileInfo: vi.fn(
      async (paths: string[]) =>
        new Map(paths.filter((path) => files.has(path)).map((path) => [path, { path }]))
    ),
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
        entries: Array<{ path: string; data: string | Uint8Array }>
      ): Promise<Array<{ path: string; bytesWritten: number; error: Error | null }>> => {
        const stateEntry = entries.find((entry) =>
          entry.path.endsWith('/.fastgpt/runtime/state.json')
        );
        if (stateEntry) {
          stateContent = Buffer.from(stateEntry.data).toString('utf8');
        } else {
          const targetEntries = entries
            .filter((entry) => !entry.path.includes('/.fastgpt/runtime/'))
            .map((entry) => ({ ...entry, data: Buffer.from(entry.data).toString('utf8') }));
          if (targetEntries.length > 0) mirrorWrites.push(targetEntries);
          entries.forEach((entry) =>
            files.set(entry.path, Buffer.from(entry.data).toString('utf8'))
          );
        }
        return entries.map((entry) => ({
          path: entry.path,
          bytesWritten: entry.data.length,
          error: null
        }));
      }
    ),
    deleteFiles: vi.fn(async (paths: string[]) =>
      paths.map((path) => {
        files.delete(path);
        return { path, success: true, error: null };
      })
    ),
    getFile: (path: string) => files.get(path),
    setFile: (path: string, content: string) => files.set(path, content),
    setState: (state: unknown) => {
      stateContent = JSON.stringify(state);
    },
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

  it('clears generated files, restores original files and keeps a later user edit', async () => {
    const original = '/home/test/.npmrc';
    const generated = '/home/test/.yarnrc';
    const modified = '/home/test/.yarnrc.yml';
    const sandbox = createSandbox({ [original]: 'user-original\n' });
    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: { npmRegistry: 'https://npm.example.com' }
    });
    expect(sandbox.getFile(original)).toContain('https://npm.example.com');
    expect(sandbox.getFile(generated)).toContain('https://npm.example.com');
    sandbox.setFile(modified, 'user-custom-setting\n');

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });

    expect(sandbox.getFile(original)).toBe('user-original\n');
    expect(sandbox.getFile(generated)).toBeUndefined();
    expect(sandbox.getFile(modified)).toBe('user-custom-setting\n');
    expect(sandbox.getState()?.values.npmMirror).toBe(buildRuntimeHash(''));
  });

  it('keeps user edits to an originally existing file and backs them up for the next activation', async () => {
    const target = '/home/test/.npmrc';
    const sandbox = createSandbox({ [target]: 'initial\n' });
    const config = { npmRegistry: 'https://npm.example.com' };
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config });
    sandbox.setFile(target, 'user-new\n');
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });
    expect(sandbox.getFile(target)).toBe('user-new\n');

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config });
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });
    expect(sandbox.getFile(target)).toBe('user-new\n');
  });

  it('retries a failed deletion instead of recording the cleared mirror as synchronized', async () => {
    const target = '/home/test/.yarnrc';
    const sandbox = createSandbox();
    const url = 'https://npm.example.com';
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: { npmRegistry: url } });
    const remove = sandbox.deleteFiles.getMockImplementation()!;
    sandbox.deleteFiles.mockImplementationOnce(async (paths) =>
      paths.map((path) => ({ path, success: false, error: new Error('denied') }))
    );
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });
    expect(sandbox.getFile(target)).toBeDefined();
    expect(sandbox.getState()?.values.npmMirror).toBe(buildRuntimeHash(url));
    sandbox.deleteFiles.mockImplementation(remove);
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });
    expect(sandbox.getFile(target)).toBeUndefined();
    expect(sandbox.getState()?.values.npmMirror).toBe(buildRuntimeHash(''));
  });

  it('restores the original file after a failed partial target write', async () => {
    const target = '/home/test/.npmrc';
    const config = { npmRegistry: 'https://npm.example.com' };
    const sandbox = createSandbox({ [target]: 'original\n' });
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config });

    const markerPath = `/home/test/.fastgpt/runtime/mirrors/${buildRuntimeHash(target).slice(7)}.json`;
    const backupPath = `/home/test/.fastgpt/runtime/mirrors/${buildRuntimeHash(target).slice(7)}.backup`;
    const write = sandbox.writeFiles.getMockImplementation()!;
    sandbox.writeFiles.mockImplementation(async (entries) => {
      if (!entries.some((entry) => entry.path === target)) return write(entries);
      const results = await write(entries);
      // 模拟 provider 截断目标后写入部分内容并返回失败。
      sandbox.setFile(target, 'partial\n');
      return results.map((result) =>
        result.path === target
          ? { ...result, bytesWritten: 8, error: new Error('partial write') }
          : result
      );
    });

    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: { npmRegistry: 'https://npm2.example.com' }
    });
    sandbox.writeFiles.mockImplementation(write);
    expect(sandbox.getFile(target)).toBe('partial\n');
    expect(sandbox.getFile(backupPath)).toBe('original\n');
    expect(sandbox.getFile(markerPath)).toContain('"pending":true');
    expect(sandbox.getState()?.values.npmMirror).toBe(buildRuntimeHash(config.npmRegistry));

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });

    expect(sandbox.getFile(target)).toBe('original\n');
    expect(sandbox.getFile(backupPath)).toBeUndefined();
    expect(sandbox.getFile(markerPath)).toBeUndefined();
    expect(sandbox.getState()?.values.npmMirror).toBe(buildRuntimeHash(''));
  });

  it('does not overwrite an existing file when backing it up fails', async () => {
    const target = '/home/test/.npmrc';
    const sandbox = createSandbox({ [target]: 'original\n' });
    const write = sandbox.writeFiles.getMockImplementation()!;
    sandbox.writeFiles.mockImplementation(async (entries) =>
      entries.some(({ path }) => path.endsWith('.backup'))
        ? entries.map(({ path }) => ({ path, bytesWritten: 0, error: new Error('denied') }))
        : write(entries)
    );
    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: { npmRegistry: 'https://npm.example.com' }
    });
    expect(sandbox.getFile(target)).toBe('original\n');
    expect(sandbox.getState()?.values?.npmMirror).not.toBe(
      buildRuntimeHash('https://npm.example.com')
    );
    sandbox.writeFiles.mockImplementation(write);
    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: { npmRegistry: 'https://npm.example.com' }
    });
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });
    expect(sandbox.getFile(target)).toBe('original\n');
  });

  it('preserves an unrelated .copy file and does not treat a stat error as absence', async () => {
    const target = '/home/test/.npmrc';
    const sandbox = createSandbox({ [target]: 'original\n', [`${target}.copy`]: 'user-copy\n' });
    sandbox.getFileInfo.mockRejectedValueOnce(new Error('permission denied'));
    const config = { npmRegistry: 'https://npm.example.com' };
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config });
    expect(sandbox.getFile(target)).toBe('original\n');
    expect(sandbox.getState()?.values?.npmMirror).not.toBe(buildRuntimeHash(config.npmRegistry));
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config });
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });
    expect(sandbox.getFile(target)).toBe('original\n');
    expect(sandbox.getFile(`${target}.copy`)).toBe('user-copy\n');
  });

  it('clears created PyPI and APT files while preserving the other distribution source', async () => {
    const debian = '/etc/apt/sources.list.d/debian.sources';
    const ubuntu = '/etc/apt/sources.list.d/ubuntu.sources';
    const pip = '/home/test/.pip/pip.conf';
    const sandbox = createSandbox({
      '/etc/os-release': 'ID=debian\nVERSION_CODENAME=bookworm\n',
      [ubuntu]: 'user-ubuntu-source\n',
      [`${ubuntu}.copy`]: 'unrelated-copy\n'
    });
    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: {
        pypiIndexUrl: 'https://pypi.example.com/simple',
        aptMirror: 'https://apt.example.com/debian'
      }
    });
    expect(sandbox.getFile(pip)).toContain('pypi.example.com');
    expect(sandbox.getFile(debian)).toContain('apt.example.com');
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });
    expect(sandbox.getFile(pip)).toBeUndefined();
    expect(sandbox.getFile(debian)).toBeUndefined();
    expect(sandbox.getFile(ubuntu)).toBe('user-ubuntu-source\n');
    expect(sandbox.getFile(`${ubuntu}.copy`)).toBe('unrelated-copy\n');
  });

  it('leaves unmarked legacy files untouched instead of declaring a failed clear successful', async () => {
    const file = '/home/test/.npmrc';
    const sandbox = createSandbox({ [file]: 'registry=https://old.example.com\n' });
    const previousHash = buildRuntimeHash('https://old.example.com');
    sandbox.setState({ values: { npmMirror: previousHash } });
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });
    expect(sandbox.getFile(file)).toBe('registry=https://old.example.com\n');
    expect(sandbox.getState()?.values.npmMirror).toBe(previousHash);

    // 旧版若已错误写入空 hash，现已无法区分其残留与用户文件。
    sandbox.setState({ values: { npmMirror: buildRuntimeHash('') } });
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });
    expect(sandbox.getFile(file)).toBe('registry=https://old.example.com\n');
  });
});
