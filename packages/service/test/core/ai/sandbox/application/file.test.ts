import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { UserError } from '@fastgpt/global/common/error/utils';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import {
  addDirectoryToArchive,
  prepareSandboxFileParentDirectories,
  resolveSandboxDownloadTarget,
  writeUrlFilesToSandbox
} from '@fastgpt/service/core/ai/sandbox/application/file';
import { resolveSandboxRuntimePath } from '@fastgpt/service/core/ai/sandbox/utils';
import { SandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import type { PreparedSandboxRuntime } from '@fastgpt/service/core/ai/sandbox/application/runtime/type';
import { SANDBOX_PROVIDER } from '@fastgpt/service/core/ai/sandbox/type';
import type {
  DirectoryEntry,
  FileInfo
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/type';

const axiosMock = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/api/axios')>();
  return {
    ...mod,
    axios: axiosMock
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/runtimeProfile', () => ({
  getSandboxStaticRuntimePaths: () => ({
    workDirectory: '/workspace',
    homeDirectory: '/home/sandbox',
    skillsRootPath: '/workspace/skills',
    builtinSkillsRootPath: '/var/lib/fastgpt-runtime/skills'
  })
}));

const sessionWorkDirectory = '/workspace/sessions/chat-1';
const resolveSessionPath = (
  path: string,
  options?: { allowAbsolutePath?: boolean; allowOutsideWorkspace?: boolean }
) =>
  resolveSandboxRuntimePath(
    path,
    {
      workspaceRoot: '/workspace',
      sessionWorkDirectory
    },
    options
  );

// ─── helpers ───────────────────────────────────────────────────────────────

function makeSandbox(
  opensandboxOverrides: Partial<SandboxClient['opensandbox']> = {}
): SandboxClient {
  return {
    opensandbox: opensandboxOverrides,
    resolveRuntimePath: vi.fn(resolveSessionPath),
    runWithRecovery: vi.fn(async (fn: () => Promise<unknown>) => fn())
  } as unknown as SandboxClient;
}

function makeDirectoryEntry(
  name: string,
  opts: { isDirectory?: boolean; path?: string } = {}
): DirectoryEntry {
  const isDirectory = opts.isDirectory ?? false;
  return {
    name,
    path: opts.path ?? `/workspace/${name}`,
    isDirectory,
    isFile: !isDirectory
  };
}

function makeFileInfoMap(path: string, info: Partial<FileInfo>): Map<string, FileInfo> {
  return new Map([[path, { path, ...info }]]);
}

describe('writeUrlFilesToSandbox', () => {
  beforeEach(() => {
    axiosMock.get.mockReset();
  });

  it('skips entries without a target path', async () => {
    const sandbox = {
      createDirectories: vi.fn(),
      writeFiles: vi.fn()
    } as unknown as Parameters<typeof writeUrlFilesToSandbox>[0]['sandbox'];

    await writeUrlFilesToSandbox({
      sandbox,
      files: [{ path: '', url: 'https://example.com/ignored.txt' }]
    });

    expect(axiosMock.get).not.toHaveBeenCalled();
    expect(sandbox.createDirectories).not.toHaveBeenCalled();
    expect(sandbox.writeFiles).not.toHaveBeenCalled();
  });

  it('downloads url files and writes them to sandbox', async () => {
    const first = Buffer.from('a');
    const second = Buffer.from('bc');
    axiosMock.get
      .mockResolvedValueOnce({ data: Readable.from([first]), headers: {} })
      .mockResolvedValueOnce({ data: Readable.from([second]), headers: {} });
    const sandbox = {
      createDirectories: vi.fn(async () => undefined),
      writeFiles: vi.fn(async () => [])
    } as unknown as Parameters<typeof writeUrlFilesToSandbox>[0]['sandbox'];

    await writeUrlFilesToSandbox({
      sandbox,
      files: [
        { path: '/workspace/a.txt', url: 'https://example.com/a.txt' },
        { path: '/workspace/reports/b.txt', url: 'https://example.com/b.txt' }
      ]
    });

    expect(axiosMock.get).toHaveBeenCalledWith(
      'https://example.com/a.txt',
      expect.objectContaining({ responseType: 'stream' })
    );
    expect(axiosMock.get).toHaveBeenCalledWith(
      'https://example.com/b.txt',
      expect.objectContaining({ responseType: 'stream' })
    );
    expect(sandbox.createDirectories).toHaveBeenCalledWith(['/workspace', '/workspace/reports']);
    expect(sandbox.writeFiles).toHaveBeenCalledWith([
      { path: '/workspace/a.txt', data: first },
      { path: '/workspace/reports/b.txt', data: second }
    ]);
    expect(sandbox.createDirectories.mock.invocationCallOrder[0]).toBeLessThan(
      sandbox.writeFiles.mock.invocationCallOrder[0]
    );
  });

  it('uses the injected reader for workflow context files', async () => {
    const sandbox = {
      createDirectories: vi.fn(async () => undefined),
      writeFiles: vi.fn(async () => [])
    };
    const readInputFile = vi.fn().mockResolvedValue(Buffer.from('private'));

    await writeUrlFilesToSandbox({
      sandbox: sandbox as any,
      files: [{ path: '/workspace/private.pdf', url: 'https://files.example.com/signed' }],
      readInputFile
    });

    expect(readInputFile).toHaveBeenCalledWith('https://files.example.com/signed');
    expect(axiosMock.get).not.toHaveBeenCalled();
    expect(sandbox.writeFiles).toHaveBeenCalledWith([
      { path: '/workspace/private.pdf', data: Buffer.from('private') }
    ]);
  });

  it('maps ENOSPC write failures to agentSandboxDiskQuotaExceeded', async () => {
    const sandbox = {
      createDirectories: vi.fn(async () => undefined),
      writeFiles: vi.fn(async () => [
        {
          path: '/workspace/a.txt',
          bytesWritten: 0,
          error: new Error('write /workspace/a.txt: no space left on device')
        }
      ])
    };
    const readInputFile = vi.fn().mockResolvedValue(Buffer.from('data'));

    await expect(
      writeUrlFilesToSandbox({
        sandbox: sandbox as any,
        files: [{ path: '/workspace/a.txt', url: 'https://files.example.com/a.txt' }],
        readInputFile
      })
    ).rejects.toThrowError(new UserError(SandboxErrEnum.agentSandboxDiskQuotaExceeded));
  });

  it('rejects relative input URLs instead of calling an internal axios', async () => {
    const sandbox = { writeFiles: vi.fn() };

    await expect(
      writeUrlFilesToSandbox({
        sandbox: sandbox as any,
        files: [{ path: '/workspace/a.txt', url: '/api/system/file/d/token' }]
      })
    ).rejects.toThrow('absolute HTTP(S)');
    expect(axiosMock.get).not.toHaveBeenCalled();
  });
});

describe('prepareSandboxFileParentDirectories', () => {
  it('skips paths without a writable parent directory', async () => {
    const sandbox = { createDirectories: vi.fn() };

    await prepareSandboxFileParentDirectories(sandbox as any, ['', 'file.txt', '/root.txt']);

    expect(sandbox.createDirectories).not.toHaveBeenCalled();
  });
});

// ─── resolveSandboxWorkspacePath ───────────────────────────────────────────

describe('resolveSandboxRuntimePath', () => {
  const paths = {
    workspaceRoot: '/workspace',
    sessionWorkDirectory: '/workspace'
  };

  it('把根路径和相对路径锚定到 workDirectory，默认拒绝绝对路径', () => {
    expect(
      resolveSandboxRuntimePath('.', {
        workspaceRoot: '/home/devbox/workspace',
        sessionWorkDirectory: '/home/devbox/workspace'
      })
    ).toBe('/home/devbox/workspace');
    expect(
      resolveSandboxRuntimePath('', {
        workspaceRoot: '/home/devbox/workspace',
        sessionWorkDirectory: '/home/devbox/workspace/'
      })
    ).toBe('/home/devbox/workspace');
    expect(
      resolveSandboxRuntimePath('skills/a/SKILL.md', {
        workspaceRoot: '/home/devbox/workspace',
        sessionWorkDirectory: '/home/devbox/workspace'
      })
    ).toBe('/home/devbox/workspace/skills/a/SKILL.md');
    expect(resolveSandboxRuntimePath('./src/index.ts', paths)).toBe('/workspace/src/index.ts');
    expect(() => resolveSandboxRuntimePath('/home/devbox/workspace/src/index.ts', paths)).toThrow(
      'Absolute sandbox paths are not allowed'
    );
  });
});

// ─── resolveSandboxDownloadTarget ──────────────────────────────────────────

describe('resolveSandboxDownloadTarget', () => {
  it.each([
    { path: 'src', isDirectory: true, size: undefined },
    { path: 'main.py', isDirectory: false, size: 42 }
  ])('根据 provider 信息解析 $path 的类型与体积', async ({ path, isDirectory, size }) => {
    const providerPath = resolveSessionPath(path);
    const getFileInfo = vi
      .fn()
      .mockResolvedValue(makeFileInfoMap(providerPath, { isDirectory, size }));
    const sandbox = makeSandbox({ getFileInfo });

    await expect(resolveSandboxDownloadTarget(sandbox, path)).resolves.toEqual({
      providerPath,
      isDirectory,
      size
    });
    expect(getFileInfo).toHaveBeenCalledWith([providerPath]);
  });

  it('fileInfo 不存在时按路径形态兜底判断目录', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(new Map())
    });

    expect((await resolveSandboxDownloadTarget(sandbox, '.')).isDirectory).toBe(true);
    expect((await resolveSandboxDownloadTarget(sandbox, '')).isDirectory).toBe(true);
    expect((await resolveSandboxDownloadTarget(sandbox, 'workspace/')).isDirectory).toBe(true);
    expect((await resolveSandboxDownloadTarget(sandbox, 'main.py')).isDirectory).toBe(false);
  });

  it('在 getFileInfo 遇到可恢复连接异常时通过 SandboxClient 自愈重试', async () => {
    const query = {
      sandboxId: 'sandbox-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      userId: 'user-1',
      chatId: 'chat-1'
    };
    const brokenSandbox = {
      id: 'remote-1',
      close: vi.fn(async () => undefined),
      getFileInfo: vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))
    };
    const recoveredSandbox = {
      id: 'remote-2',
      close: vi.fn(async () => undefined),
      getFileInfo: vi
        .fn()
        .mockResolvedValueOnce(
          makeFileInfoMap('/workspace/sessions/chat-1/file.txt', { isDirectory: false, size: 17 })
        )
    };
    const initialRuntime = {
      resource: {
        ...query,
        provider: SANDBOX_PROVIDER,
        status: SandboxInstanceStatusEnum.running,
        teamId: 'team-1'
      },
      opensandbox: brokenSandbox
    } as unknown as PreparedSandboxRuntime;
    const recoveredRuntime = {
      resource: {
        ...query,
        provider: SANDBOX_PROVIDER,
        status: SandboxInstanceStatusEnum.running,
        teamId: 'team-1'
      },
      opensandbox: recoveredSandbox
    } as unknown as PreparedSandboxRuntime;
    let currentRuntime = initialRuntime;
    const prepare = vi.fn(async (_conn, options?: { verifyHealth?: boolean }) => {
      if (options?.verifyHealth) {
        currentRuntime = recoveredRuntime;
      }
      return currentRuntime;
    });
    const sandbox = new SandboxClient({
      query,
      runtime: initialRuntime,
      prepare
    });

    await expect(resolveSandboxDownloadTarget(sandbox, 'file.txt')).resolves.toEqual({
      providerPath: '/workspace/sessions/chat-1/file.txt',
      isDirectory: false,
      size: 17
    });
    expect(prepare).toHaveBeenCalledWith(expect.anything(), { verifyHealth: true });
    expect(brokenSandbox.close).toHaveBeenCalled();
  });
});

// ─── addDirectoryToArchive ─────────────────────────────────────────────────

describe('addDirectoryToArchive', () => {
  function makeArchive() {
    return { append: vi.fn() } as unknown as Parameters<typeof addDirectoryToArchive>[0]['archive'];
  }

  it('逐文件把 provider download stream 交给 archive', async () => {
    const archive = makeArchive();
    const entries = [
      makeDirectoryEntry('ok.py', { path: '/workspace/ok.py' }),
      makeDirectoryEntry('other.py', { path: '/workspace/other.py' })
    ];
    const readFileStream = vi.fn((_path: string) =>
      (async function* () {
        yield new TextEncoder().encode('content');
      })()
    );
    const sandbox = makeSandbox({
      listDirectory: vi.fn().mockResolvedValue(entries),
      readFileStream
    });
    await addDirectoryToArchive({ sandbox, archive, dirPath: '/workspace', archivePath: '' });
    expect(archive.append).toHaveBeenCalledTimes(2);
    expect(archive.append).toHaveBeenCalledWith(expect.anything(), { name: 'ok.py' });
    expect(readFileStream).toHaveBeenCalledWith('/workspace/ok.py');
  });

  it('深层嵌套目录递归正确', async () => {
    const archive = makeArchive();
    const listDirectory = vi
      .fn()
      .mockResolvedValueOnce([makeDirectoryEntry('a', { isDirectory: true, path: '/workspace/a' })])
      .mockResolvedValueOnce([
        makeDirectoryEntry('b', { isDirectory: true, path: '/workspace/a/b' })
      ])
      .mockResolvedValueOnce([makeDirectoryEntry('c.txt', { path: '/workspace/a/b/c.txt' })]);
    const readFileStream = vi.fn(() =>
      (async function* () {
        yield new TextEncoder().encode('deep');
      })()
    );
    const sandbox = makeSandbox({ listDirectory, readFileStream });
    await addDirectoryToArchive({ sandbox, archive, dirPath: '/workspace', archivePath: '' });
    expect(archive.append).toHaveBeenCalledWith(expect.anything(), { name: 'a/b/c.txt' });
  });

  it('超过最大深度限制时停止递归', async () => {
    const archive = makeArchive();
    const listDirectory = vi
      .fn()
      .mockResolvedValue([
        makeDirectoryEntry('sub', { isDirectory: true, path: '/workspace/sub' })
      ]);
    const sandbox = makeSandbox({ listDirectory });
    // depth=21 超过 MAX_ARCHIVE_DEPTH(20)，应直接返回不做任何操作
    await addDirectoryToArchive({
      sandbox,
      archive,
      dirPath: '/workspace',
      archivePath: '',
      depth: 21
    });
    expect(listDirectory).not.toHaveBeenCalled();
    expect(archive.append).not.toHaveBeenCalled();
  });

  it('拒绝下载工作区外的路径与归档 provider 返回的 workspace 外绝对路径', async () => {
    const downloadSandbox = makeSandbox({ getFileInfo: vi.fn() });
    await expect(
      resolveSandboxDownloadTarget(downloadSandbox, '/etc/secret.txt')
    ).rejects.toThrow();
    await expect(
      resolveSandboxDownloadTarget(
        downloadSandbox,
        '/var/lib/fastgpt-runtime/.fastgpt-ide-agent-password'
      )
    ).rejects.toThrow();

    const archive = makeArchive();
    const readFileStream = vi.fn();
    const sandbox = makeSandbox({
      listDirectory: vi.fn().mockResolvedValue([
        makeDirectoryEntry('secret.txt', {
          path: '/etc/secret.txt'
        })
      ]),
      readFileStream
    });

    await expect(
      addDirectoryToArchive({ sandbox, archive, dirPath: '/workspace', archivePath: '' })
    ).rejects.toThrow();
    expect(readFileStream).not.toHaveBeenCalled();
    expect(archive.append).not.toHaveBeenCalled();
  });

  it('仅归档 workspace 内部子目录（包括同名 lost+found），拒绝 $HOME 等 workspace 外根目录', async () => {
    const archive = makeArchive();
    await expect(
      addDirectoryToArchive({
        sandbox: makeSandbox({ listDirectory: vi.fn() }),
        archive,
        dirPath: '/home/sandbox',
        archivePath: ''
      })
    ).rejects.toThrow();

    const listDirectory = vi.fn().mockImplementation(async (dir: string) => {
      if (dir === '/workspace') {
        return [
          makeDirectoryEntry('lost+found', {
            isDirectory: true,
            path: '/workspace/lost+found'
          })
        ];
      }
      if (dir === '/workspace/lost+found') {
        return [
          makeDirectoryEntry('keep.txt', {
            path: '/workspace/lost+found/keep.txt'
          })
        ];
      }
      return [];
    });
    const readFileStream = vi.fn(() =>
      (async function* () {
        yield new TextEncoder().encode('data');
      })()
    );
    const sandbox = makeSandbox({ listDirectory, readFileStream });

    await addDirectoryToArchive({
      sandbox,
      archive,
      dirPath: '/workspace',
      archivePath: ''
    });

    expect(archive.append).toHaveBeenCalledWith(expect.anything(), {
      name: 'lost+found/keep.txt'
    });
  });
});
