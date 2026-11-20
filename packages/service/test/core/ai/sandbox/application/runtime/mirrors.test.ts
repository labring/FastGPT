import { SandboxApiException } from '@alibaba-group/opensandbox';
import { describe, expect, it, vi } from 'vitest';
import { SandboxNotFoundError } from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/errors';
import { prepareSandboxRuntimeMirrors } from '@fastgpt/service/core/ai/sandbox/application/runtime/mirrors';
import {
  readSandboxRuntimeState,
  runWithSandboxRuntimeStateScope,
  setRuntimeStateValue,
  writeSandboxRuntimeState
} from '@fastgpt/service/core/ai/sandbox/application/runtime/state';
import { buildRuntimeHash } from '@fastgpt/service/core/ai/sandbox/utils';

const createMissingFileError = (path: string) =>
  new SandboxApiException({
    message: `File not found: ${path}`,
    statusCode: 404,
    error: { code: 'FILE_NOT_FOUND', message: `File not found: ${path}` }
  });

const HOME_STATE_PATH = '/home/sandbox/.fastgpt/runtime/state.json';
const CONTAINER_STATE_PATH = '/var/lib/fastgpt-runtime/state.json';

const createSandbox = (initialFiles: Record<string, string> = {}) => {
  let homeStateContent: string | undefined;
  let containerStateContent: string | undefined;
  const mirrorWrites: Array<Array<{ path: string; data: string }>> = [];
  const files = new Map(Object.entries(initialFiles));

  const sandbox = {
    execute: vi.fn(async (command: string) => {
      throw new Error(`Unexpected command: ${command}`);
    }),
    createDirectories: vi.fn(async () => undefined),
    getFileInfo: vi.fn(
      async (paths: string[]) =>
        new Map(paths.filter((path) => files.has(path)).map((path) => [path, { path }]))
    ),
    readFiles: vi.fn(async (paths: string[]) =>
      paths.map((path) => {
        const content =
          path === HOME_STATE_PATH
            ? homeStateContent
            : path === CONTAINER_STATE_PATH
              ? containerStateContent
              : files.get(path);
        return {
          path,
          content: Buffer.from(content ?? ''),
          error: content === undefined ? createMissingFileError(path) : null
        };
      })
    ),
    writeFiles: vi.fn(
      async (
        entries: Array<{ path: string; data: string | Uint8Array }>
      ): Promise<Array<{ path: string; bytesWritten: number; error: Error | null }>> => {
        const homeStateEntry = entries.find((entry) => entry.path === HOME_STATE_PATH);
        const containerStateEntry = entries.find((entry) => entry.path === CONTAINER_STATE_PATH);
        if (homeStateEntry) {
          homeStateContent = Buffer.from(homeStateEntry.data).toString('utf8');
        } else if (containerStateEntry) {
          containerStateContent = Buffer.from(containerStateEntry.data).toString('utf8');
        } else {
          const targetEntries = entries
            .filter(
              (entry) =>
                !entry.path.includes('/.fastgpt/runtime/') &&
                !entry.path.startsWith('/var/lib/fastgpt-runtime/')
            )
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
    setState: (state: unknown, scope: 'home' | 'container' = 'home') => {
      const serialized = JSON.stringify(state);
      if (scope === 'container') {
        containerStateContent = serialized;
      } else {
        homeStateContent = serialized;
      }
    },
    resetContainerLayer: (nextContainerFiles: Record<string, string> = {}) => {
      containerStateContent = undefined;
      for (const key of [...files.keys()]) {
        if (!key.startsWith('/home/sandbox/')) {
          files.delete(key);
        }
      }
      for (const [path, content] of Object.entries(nextContainerFiles)) {
        files.set(path, content);
      }
    },
    getMirrorWrites: () => mirrorWrites,
    getState: (scope: 'home' | 'container' = 'home') => {
      const content = scope === 'container' ? containerStateContent : homeStateContent;
      return content ? JSON.parse(content) : undefined;
    }
  };

  return sandbox;
};

describe('sandbox runtime mirrors', () => {
  it('does not create home or container state.json when no mirrors are configured on a fresh sandbox', async () => {
    const sandbox = createSandbox();

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });

    expect(sandbox.getMirrorWrites()).toEqual([]);
    expect(sandbox.getState('home')).toBeUndefined();
    expect(sandbox.getState('container')).toBeUndefined();
    expect(sandbox.writeFiles).not.toHaveBeenCalled();
  });

  it('synchronizes npm and pypi mirror groups independently', async () => {
    const sandbox = createSandbox();
    const config = {
      npmRegistry: 'https://npm.example.com',
      pypiIndexUrl: 'https://pypi.example.com/simple'
    };
    const expectedWriteEntries = [
      { path: '/home/sandbox/.npmrc', data: 'registry=https://npm.example.com\n' },
      { path: '/home/sandbox/.yarnrc', data: 'registry "https://npm.example.com"\n' },
      {
        path: '/home/sandbox/.yarnrc.yml',
        data: 'npmRegistryServer: "https://npm.example.com"\n'
      },
      {
        path: '/home/sandbox/.bunfig.toml',
        data: '[install]\nregistry = "https://npm.example.com"\n'
      },
      {
        path: '/home/sandbox/.pip/pip.conf',
        data: '[global]\nindex-url = https://pypi.example.com/simple\ntrusted-host = pypi.example.com\n'
      },
      {
        path: '/home/sandbox/.config/pip/pip.conf',
        data: '[global]\nindex-url = https://pypi.example.com/simple\ntrusted-host = pypi.example.com\n'
      },
      {
        path: '/home/sandbox/.config/uv/uv.toml',
        data: 'default-index = "https://pypi.example.com/simple"\nallow-insecure-host = ["pypi.example.com"]\n'
      }
    ];

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config });
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config });

    expect(sandbox.getMirrorWrites()).toEqual([
      expectedWriteEntries.slice(0, 4),
      expectedWriteEntries.slice(4)
    ]);
    expect(sandbox.getState('home')?.values).toEqual({
      npmMirror: buildRuntimeHash(config.npmRegistry),
      pypiMirror: buildRuntimeHash(config.pypiIndexUrl)
    });
    expect(sandbox.getState('container')).toBeUndefined();

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
      '/home/sandbox/.npmrc',
      '/home/sandbox/.yarnrc',
      '/home/sandbox/.yarnrc.yml',
      '/home/sandbox/.bunfig.toml'
    ]);
    expect(sandbox.getState('home')?.values).toEqual({
      npmMirror: buildRuntimeHash('https://another-npm.example.com'),
      pypiMirror: buildRuntimeHash(config.pypiIndexUrl)
    });
    expect(sandbox.getState('container')).toBeUndefined();
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
    expect(sandbox.getState('home')?.values).toEqual({
      npmMirror: buildRuntimeHash(config.npmRegistry)
    });
    expect(sandbox.getState('container')).toBeUndefined();
    expect(
      sandbox.readFiles.mock.calls.filter(([paths]) => paths.includes('/etc/os-release'))
    ).toHaveLength(2);
  });

  it('clears generated files, restores original files and keeps a later user edit', async () => {
    const original = '/home/sandbox/.npmrc';
    const generated = '/home/sandbox/.yarnrc';
    const modified = '/home/sandbox/.yarnrc.yml';
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
    expect(sandbox.getState()?.values).toBeUndefined();
  });

  it('keeps user edits to an originally existing file and backs them up for the next activation', async () => {
    const target = '/home/sandbox/.npmrc';
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
    const target = '/home/sandbox/.yarnrc';
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
    expect(sandbox.getState()?.values).toBeUndefined();
  });

  it('replays a pending existing-file write without treating residue as user content', async () => {
    const target = '/home/sandbox/.npmrc';
    const sandbox = createSandbox({ [target]: 'original\n' });
    const firstConfig = { npmRegistry: 'https://npm.example.com' };
    const retryConfig = { npmRegistry: 'https://npm2.example.com' };
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: firstConfig });

    const markerPath = `/home/sandbox/.fastgpt/runtime/mirrors/${buildRuntimeHash(target).slice(7)}.json`;
    const backupPath = `/home/sandbox/.fastgpt/runtime/mirrors/${buildRuntimeHash(target).slice(7)}.backup`;
    const write = sandbox.writeFiles.getMockImplementation()!;
    let failed = false;
    sandbox.writeFiles.mockImplementation(async (entries) => {
      if (failed || !entries.some((entry) => entry.path === target)) return write(entries);
      failed = true;
      const results = await write(entries);
      sandbox.setFile(target, 'partial\n');
      return results.map((result) =>
        result.path === target
          ? { ...result, bytesWritten: 8, error: new Error('partial write') }
          : result
      );
    });

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: retryConfig });
    expect(sandbox.getFile(markerPath)).toContain('"pending":true');

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: retryConfig });
    sandbox.writeFiles.mockImplementation(write);

    expect(sandbox.getFile(target)).toContain('https://npm2.example.com');
    expect(sandbox.getFile(backupPath)).toBe('original\n');
    expect(sandbox.getFile(markerPath)).not.toContain('"pending":true');

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });
    expect(sandbox.getFile(target)).toBe('original\n');
    expect(sandbox.getFile(backupPath)).toBeUndefined();
  });

  it('replays a pending created-file write and restores absence on clear', async () => {
    const target = '/home/sandbox/.yarnrc';
    const sandbox = createSandbox();
    const firstConfig = { npmRegistry: 'https://npm.example.com' };
    const retryConfig = { npmRegistry: 'https://npm2.example.com' };
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: firstConfig });

    const write = sandbox.writeFiles.getMockImplementation()!;
    let failed = false;
    sandbox.writeFiles.mockImplementation(async (entries) => {
      if (failed || !entries.some((entry) => entry.path === target)) return write(entries);
      failed = true;
      const results = await write(entries);
      sandbox.setFile(target, 'partial\n');
      return results.map((result) =>
        result.path === target
          ? { ...result, bytesWritten: 8, error: new Error('partial write') }
          : result
      );
    });

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: retryConfig });
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: retryConfig });
    sandbox.writeFiles.mockImplementation(write);
    expect(sandbox.getFile(target)).toContain('https://npm2.example.com');

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });
    expect(sandbox.getFile(target)).toBeUndefined();
  });

  it('keeps pending created-file evidence when clearing before a successful retry', async () => {
    const target = '/home/sandbox/.yarnrc';
    const sandbox = createSandbox();
    const config = { npmRegistry: 'https://npm.example.com' };
    const write = sandbox.writeFiles.getMockImplementation()!;
    let failed = false;
    sandbox.writeFiles.mockImplementation(async (entries) => {
      if (failed || !entries.some((entry) => entry.path === target)) return write(entries);
      failed = true;
      const results = await write(entries);
      sandbox.setFile(target, 'partial\n');
      return results.map((result) =>
        result.path === target
          ? { ...result, bytesWritten: 8, error: new Error('partial write') }
          : result
      );
    });

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config });
    sandbox.writeFiles.mockImplementation(write);
    const markerPath = `/home/sandbox/.fastgpt/runtime/mirrors/${buildRuntimeHash(target).slice(7)}.json`;
    expect(sandbox.getFile(target)).toBe('partial\n');
    expect(sandbox.getFile(markerPath)).toContain('"pending":true');

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });

    expect(sandbox.getFile(target)).toBe('partial\n');
    expect(sandbox.getFile(markerPath)).toContain('"pending":true');
    expect(sandbox.getState()?.values?.npmMirror).toBeUndefined();
  });

  it('restores the original file after a failed partial target write', async () => {
    const target = '/home/sandbox/.npmrc';
    const config = { npmRegistry: 'https://npm.example.com' };
    const sandbox = createSandbox({ [target]: 'original\n' });
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config });

    const markerPath = `/home/sandbox/.fastgpt/runtime/mirrors/${buildRuntimeHash(target).slice(7)}.json`;
    const backupPath = `/home/sandbox/.fastgpt/runtime/mirrors/${buildRuntimeHash(target).slice(7)}.backup`;
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
    expect(sandbox.getState()?.values).toBeUndefined();
  });

  it('does not overwrite an existing file when backing it up fails', async () => {
    const target = '/home/sandbox/.npmrc';
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
    const target = '/home/sandbox/.npmrc';
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
    const pip = '/home/sandbox/.pip/pip.conf';
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
    const file = '/home/sandbox/.npmrc';
    const sandbox = createSandbox({ [file]: 'registry=https://old.example.com\n' });
    const previousHash = buildRuntimeHash('https://old.example.com');
    sandbox.setState({ values: { npmMirror: previousHash } });
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });
    expect(sandbox.getFile(file)).toBe('registry=https://old.example.com\n');
    expect(sandbox.getState()?.values.npmMirror).toBe(previousHash);

    // 旧版若已写入空 hash，清空时会顺便删掉遗留空键且不误删无法辨别归属的用户文件。
    sandbox.setState({ values: { npmMirror: buildRuntimeHash('') } });
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });
    expect(sandbox.getFile(file)).toBe('registry=https://old.example.com\n');
    expect(sandbox.getState()?.values).toBeUndefined();
  });

  it('keeps non-root apt write failures from updating apt state and clears pending backup without rewriting unchanged target', async () => {
    const debian = '/etc/apt/sources.list.d/debian.sources';
    const debianId = buildRuntimeHash(debian).slice(7);
    const debianBackup = `/var/lib/fastgpt-runtime/mirrors/${debianId}.backup`;
    const debianMarker = `/var/lib/fastgpt-runtime/mirrors/${debianId}.json`;
    const sandbox = createSandbox({
      '/etc/os-release': 'ID=debian\nVERSION_CODENAME=bookworm\n',
      [debian]: 'original-debian\n'
    });
    const baseWrite = sandbox.writeFiles.getMockImplementation()!;
    sandbox.writeFiles.mockImplementation(async (entries) =>
      entries.some((entry) => entry.path === debian)
        ? entries.map((entry) => ({
            path: entry.path,
            bytesWritten: 0,
            error: new Error('EACCES: permission denied')
          }))
        : baseWrite(entries)
    );

    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: {
        npmRegistry: 'https://npm.example.com',
        aptMirror: 'https://apt.example.com/debian'
      }
    });

    expect(sandbox.getFile(debian)).toBe('original-debian\n');
    expect(sandbox.getFile(debianBackup)).toBe('original-debian\n');
    expect(sandbox.getFile(debianMarker)).toContain('"pending":true');
    expect(sandbox.getState('home')?.values).toEqual({
      npmMirror: buildRuntimeHash('https://npm.example.com')
    });
    expect(sandbox.getState('container')).toBeUndefined();

    // 清空 aptMirror 时原文件与备份一致，跳过写入 /etc/apt 并清理容器态目录中的 pending 备份和 marker。
    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: { npmRegistry: 'https://npm.example.com' }
    });
    expect(sandbox.getFile(debian)).toBe('original-debian\n');
    expect(sandbox.getFile(debianBackup)).toBeUndefined();
    expect(sandbox.getFile(debianMarker)).toBeUndefined();
    expect(sandbox.getState('container')).toBeUndefined();
  });

  it('restores v4.17.4 legacy .copy backup on clear and rejects tampered legacyBackup marker hash', async () => {
    const npmrc = '/home/sandbox/.npmrc';
    const npmrcCopy = `${npmrc}.copy`;
    const npmMarker = `/home/sandbox/.fastgpt/runtime/mirrors/${buildRuntimeHash(npmrc).slice(7)}.json`;
    const originalNpm = 'registry=https://corp.example/\n';
    const mirrorNpm = 'registry=https://mirror-a.example.com\n';

    // 1. v4.17.4 原位复用容器（有活动 hash 与 .copy，无 marker）：清空恢复原件并保留 .copy。
    const v4174Sandbox = createSandbox({
      [npmrc]: mirrorNpm,
      [npmrcCopy]: originalNpm
    });
    v4174Sandbox.setState({
      values: { npmMirror: buildRuntimeHash('https://mirror-a.example.com') }
    });
    await prepareSandboxRuntimeMirrors({ sandbox: v4174Sandbox as any, config: {} });
    expect(v4174Sandbox.getFile(npmrc)).toBe(originalNpm);
    expect(v4174Sandbox.getFile(npmrcCopy)).toBe(originalNpm);
    expect(v4174Sandbox.getState()?.values).toBeUndefined();

    // 2. 带 legacyBackup marker 但 .copy 已被篡改（backupHash 不匹配）：拒绝覆写并保留原状与 marker。
    const tamperedCopy = 'registry=https://tampered.example/\n';
    const markerContent = JSON.stringify({
      version: 1,
      path: npmrc,
      origin: 'legacyBackup',
      backupHash: buildRuntimeHash(originalNpm),
      hashes: [buildRuntimeHash(mirrorNpm)]
    });
    const tamperedSandbox = createSandbox({
      [npmrc]: mirrorNpm,
      [npmrcCopy]: tamperedCopy,
      [npmMarker]: markerContent
    });
    tamperedSandbox.setState({
      values: { npmMirror: buildRuntimeHash('https://mirror-a.example.com') }
    });
    await prepareSandboxRuntimeMirrors({ sandbox: tamperedSandbox as any, config: {} });
    expect(tamperedSandbox.getFile(npmrc)).toBe(mirrorNpm);
    expect(tamperedSandbox.getFile(npmrcCopy)).toBe(tamperedCopy);
    expect(tamperedSandbox.getFile(npmMarker)).toBe(markerContent);
    expect(tamperedSandbox.getState()?.values.npmMirror).toBe(
      buildRuntimeHash('https://mirror-a.example.com')
    );
  });

  it('skips mirror sync and refuses sibling state writes when runtime state read fails with a non-404 error', async () => {
    const npmrc = '/home/sandbox/.npmrc';
    const originalNpmrc = 'registry=https://original.example/\n';
    const sandbox = createSandbox({ [npmrc]: originalNpmrc });

    await prepareSandboxRuntimeMirrors({
      sandbox: sandbox as any,
      config: { npmRegistry: 'https://mirror-a.example.com' }
    });

    const readError = async (paths: string[]) =>
      paths.map((path) => ({
        path,
        content: Buffer.alloc(0),
        error: new Error('EIO reading state.json')
      }));
    sandbox.readFiles
      .mockImplementationOnce(readError)
      .mockImplementationOnce(readError)
      .mockImplementationOnce(readError)
      .mockImplementationOnce(readError);

    await runWithSandboxRuntimeStateScope(async () => {
      await prepareSandboxRuntimeMirrors({
        sandbox: sandbox as any,
        config: { npmRegistry: 'https://mirror-b.example.com' }
      });
      const homeSiblingState = await readSandboxRuntimeState({
        sandbox: sandbox as any,
        scope: 'home'
      });
      setRuntimeStateValue({
        state: homeSiblingState.state,
        key: 'npmMirror',
        value: buildRuntimeHash('https://mirror-b.example.com')
      });
      expect(
        await writeSandboxRuntimeState({
          sandbox: sandbox as any,
          context: homeSiblingState,
          scope: 'home'
        })
      ).toBe(false);

      const containerSiblingState = await readSandboxRuntimeState({ sandbox: sandbox as any });
      setRuntimeStateValue({
        state: containerSiblingState.state,
        key: 'entrypoint',
        value: buildRuntimeHash('entrypoint-v1')
      });
      expect(
        await writeSandboxRuntimeState({
          sandbox: sandbox as any,
          context: containerSiblingState
        })
      ).toBe(false);
    });

    expect(sandbox.getState('home')?.values.npmMirror).toBe(
      buildRuntimeHash('https://mirror-a.example.com')
    );
  });

  it('re-applies apt mirror after container recreation on the same $HOME volume while keeping npm/pypi markers and rollback intact', async () => {
    const npmrc = '/home/sandbox/.npmrc';
    const yarnrc = '/home/sandbox/.yarnrc';
    const pipConf = '/home/sandbox/.pip/pip.conf';
    const debian = '/etc/apt/sources.list.d/debian.sources';
    const sandbox = createSandbox({
      [npmrc]: 'user-original-npmrc\n',
      '/etc/os-release': 'ID=debian\nVERSION_CODENAME=trixie\n',
      [debian]: 'image-default-debian\n'
    });
    const config = {
      npmRegistry: 'https://npm.example.com',
      pypiIndexUrl: 'https://pypi.example.com/simple',
      aptMirror: 'https://apt.example.com/debian'
    };

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config });
    expect(sandbox.getFile(npmrc)).toContain('https://npm.example.com');
    expect(sandbox.getFile(pipConf)).toContain('https://pypi.example.com/simple');
    expect(sandbox.getFile(debian)).toContain('https://apt.example.com/debian');
    expect(sandbox.getMirrorWrites()).toHaveLength(3);

    // 模拟容器销毁并在同一 `$HOME` PVC 上重建：容器临时层与 `/var/lib/fastgpt-runtime` 清空，`$HOME` 保留。
    sandbox.resetContainerLayer({
      '/etc/os-release': 'ID=debian\nVERSION_CODENAME=trixie\n',
      [debian]: 'image-default-debian\n'
    });

    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config });
    expect(sandbox.getMirrorWrites()).toHaveLength(4);
    expect(sandbox.getMirrorWrites()[3].map(({ path }) => path)).toEqual([debian]);
    expect(sandbox.getFile(debian)).toContain('https://apt.example.com/debian');

    // 清空所有镜像配置：npm/pypi 依赖 `$HOME` 持久化的 marker/backup 完整恢复原件，apt 依赖新容器层 backup 恢复。
    await prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} });
    expect(sandbox.getFile(npmrc)).toBe('user-original-npmrc\n');
    expect(sandbox.getFile(yarnrc)).toBeUndefined();
    expect(sandbox.getFile(pipConf)).toBeUndefined();
    expect(sandbox.getFile(debian)).toBe('image-default-debian\n');
  });

  it('rethrows recoverable sandbox errors during write, os-release read, inspection, or deletion', async () => {
    const sandbox = createSandbox({
      '/etc/os-release': 'ID=ubuntu\nVERSION_CODENAME=noble\n'
    });

    sandbox.writeFiles.mockRejectedValueOnce(
      new SandboxNotFoundError('Sandbox disappeared during write')
    );
    await expect(
      prepareSandboxRuntimeMirrors({
        sandbox: sandbox as any,
        config: { npmRegistry: 'https://npm.example.com' }
      })
    ).rejects.toBeInstanceOf(SandboxNotFoundError);

    const baseReadFiles = sandbox.readFiles.getMockImplementation()!;
    sandbox.readFiles.mockImplementation(async (paths: string[]) => {
      if (paths.includes('/etc/os-release')) {
        return paths.map((path) => ({
          path,
          content: Buffer.alloc(0),
          error: new SandboxNotFoundError('Sandbox disappeared during os-release read')
        }));
      }
      return baseReadFiles(paths);
    });
    await expect(
      prepareSandboxRuntimeMirrors({
        sandbox: sandbox as any,
        config: { aptMirror: 'https://apt.example.com/ubuntu' }
      })
    ).rejects.toBeInstanceOf(SandboxNotFoundError);
    sandbox.readFiles.mockImplementation(baseReadFiles);

    sandbox.setState({ values: { npmMirror: buildRuntimeHash('https://npm.example.com') } });
    sandbox.getFileInfo.mockRejectedValueOnce(
      new SandboxNotFoundError('Sandbox disappeared during stat')
    );
    await expect(
      prepareSandboxRuntimeMirrors({ sandbox: sandbox as any, config: {} })
    ).rejects.toBeInstanceOf(SandboxNotFoundError);
  });
});
