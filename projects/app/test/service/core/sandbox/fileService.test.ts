import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listSandboxDirectory,
  listSandboxDirectoryRecursive,
  writeSandboxFile,
  isSandboxPathDirectory,
  getSandboxFileContent,
  addDirectoryToArchive,
  resolveSandboxWorkspacePath,
  toSandboxWorkspaceRelativePath,
  type SandboxFileEntry
} from '@/service/core/sandbox/fileService';
import type { SandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import type {
  DirectoryEntry,
  FileInfo,
  FileReadResult,
  FileWriteResult
} from '@fastgpt-sdk/sandbox-adapter';

// ─── helpers ───────────────────────────────────────────────────────────────

function makeProvider(
  overrides: Partial<SandboxClient['provider']> = {}
): SandboxClient['provider'] {
  return {
    listDirectory: vi.fn(),
    writeFiles: vi.fn(),
    readFiles: vi.fn(),
    getFileInfo: vi.fn(),
    ensureRunning: vi.fn(),
    execute: vi.fn(),
    delete: vi.fn(),
    stop: vi.fn(),
    provider: 'mock',
    ...overrides
  } as unknown as SandboxClient['provider'];
}

function makeSandbox(providerOverrides: Partial<SandboxClient['provider']> = {}): SandboxClient {
  return { provider: makeProvider(providerOverrides) } as unknown as SandboxClient;
}

function makeDirectoryEntry(
  name: string,
  opts: { isDirectory?: boolean; size?: number; path?: string } = {}
): DirectoryEntry {
  const isDirectory = opts.isDirectory ?? false;
  return {
    name,
    path: opts.path ?? `/workspace/${name}`,
    isDirectory,
    isFile: !isDirectory,
    size: opts.size
  };
}

function makeReadResult(path: string, content: string, error: Error | null = null): FileReadResult {
  return {
    path,
    content: new TextEncoder().encode(content),
    error
  };
}

function makeWriteResult(path: string, error: Error | null = null): FileWriteResult {
  return { path, bytesWritten: error ? 0 : 10, error };
}

function makeFileInfoMap(path: string, info: Partial<FileInfo>): Map<string, FileInfo> {
  return new Map([[path, { path, ...info }]]);
}

// ─── resolveSandboxWorkspacePath ───────────────────────────────────────────

describe('resolveSandboxWorkspacePath', () => {
  it('把工作区根路径请求解析到 workDirectory', () => {
    expect(resolveSandboxWorkspacePath('.', '/home/devbox/workspace')).toBe(
      '/home/devbox/workspace'
    );
    expect(resolveSandboxWorkspacePath('', '/home/devbox/workspace/')).toBe(
      '/home/devbox/workspace'
    );
  });

  it('把相对路径锚定到 workDirectory，避免 Sealos 默认落到 /home/devbox', () => {
    expect(resolveSandboxWorkspacePath('skills/a/SKILL.md', '/home/devbox/workspace')).toBe(
      '/home/devbox/workspace/skills/a/SKILL.md'
    );
    expect(resolveSandboxWorkspacePath('./src/index.ts', '/workspace')).toBe(
      '/workspace/src/index.ts'
    );
  });

  it('保持绝对路径不变，兼容已加载文件树中的路径', () => {
    expect(resolveSandboxWorkspacePath('/home/devbox/workspace/src/index.ts', '/workspace')).toBe(
      '/home/devbox/workspace/src/index.ts'
    );
  });

  it('拒绝路径穿越', () => {
    expect(() => resolveSandboxWorkspacePath('../secret.txt', '/workspace')).toThrow(
      'Path traversal detected'
    );
  });
});

// ─── toSandboxWorkspaceRelativePath ────────────────────────────────────────

describe('toSandboxWorkspaceRelativePath', () => {
  it('把 workspace 绝对路径还原成前端使用的相对路径', () => {
    expect(
      toSandboxWorkspaceRelativePath(
        '/home/devbox/workspace/src/index.ts',
        '/home/devbox/workspace'
      )
    ).toBe('src/index.ts');
    expect(toSandboxWorkspaceRelativePath('/home/devbox/workspace', '/home/devbox/workspace')).toBe(
      '.'
    );
  });

  it('保持相对路径语义，避免影响前端本地新增节点', () => {
    expect(toSandboxWorkspaceRelativePath('src/index.ts', '/home/devbox/workspace')).toBe(
      'src/index.ts'
    );
    expect(toSandboxWorkspaceRelativePath('./src/index.ts', '/home/devbox/workspace')).toBe(
      'src/index.ts'
    );
    expect(toSandboxWorkspaceRelativePath('.config/pip/pip.conf', '/home/devbox/workspace')).toBe(
      '.config/pip/pip.conf'
    );
  });
});

// ─── listSandboxDirectory ──────────────────────────────────────────────────

describe('listSandboxDirectory', () => {
  it('空目录返回空数组', async () => {
    const sandbox = makeSandbox({ listDirectory: vi.fn().mockResolvedValue([]) });
    const result = await listSandboxDirectory(sandbox, '/workspace');
    expect(result).toEqual([]);
  });

  it('正确映射文件条目', async () => {
    const entries = [makeDirectoryEntry('index.ts', { size: 200 })];
    const sandbox = makeSandbox({ listDirectory: vi.fn().mockResolvedValue(entries) });
    const result = await listSandboxDirectory(sandbox, '/workspace');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject<SandboxFileEntry>({
      name: 'index.ts',
      path: 'index.ts',
      type: 'file',
      size: 200
    });
  });

  it('正确映射目录条目，size 为 undefined', async () => {
    const entries = [makeDirectoryEntry('src', { isDirectory: true })];
    const sandbox = makeSandbox({ listDirectory: vi.fn().mockResolvedValue(entries) });
    const result = await listSandboxDirectory(sandbox, '/workspace');

    expect(result[0]).toMatchObject<SandboxFileEntry>({
      name: 'src',
      type: 'directory',
      size: undefined
    });
  });

  it('混合条目正确映射', async () => {
    const entries = [
      makeDirectoryEntry('src', { isDirectory: true }),
      makeDirectoryEntry('main.py', { size: 512 })
    ];
    const sandbox = makeSandbox({ listDirectory: vi.fn().mockResolvedValue(entries) });
    const result = await listSandboxDirectory(sandbox, '/workspace');

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('directory');
    expect(result[1].type).toBe('file');
    expect(result[1].size).toBe(512);
  });

  it('传递正确的 path 参数给 provider', async () => {
    const listDirectory = vi.fn().mockResolvedValue([]);
    const sandbox = makeSandbox({ listDirectory });
    await listSandboxDirectory(sandbox, '/some/path');
    expect(listDirectory).toHaveBeenCalledWith('/some/path');
  });
});

// ─── listSandboxDirectoryRecursive ────────────────────────────────────────

describe('listSandboxDirectoryRecursive', () => {
  const makeFindRecord = (type: 'd' | 'f' | 'l', size: number, path: string) =>
    `${type}\t${size}\t${path}\0`;

  const makeExecuteSuccess = (stdout: string) =>
    vi.fn().mockResolvedValue({
      stdout,
      stderr: '',
      exitCode: 0
    });

  it('通过一次 find 命令拼接目录树并只默认展开第一层目录', async () => {
    const execute = makeExecuteSuccess(
      [
        makeFindRecord('d', 96, '.'),
        makeFindRecord('f', 2, './b.txt'),
        makeFindRecord('d', 64, './src'),
        makeFindRecord('d', 64, './src/components'),
        makeFindRecord('f', 12, './src/components/Button.tsx'),
        makeFindRecord('f', 1, './a.txt'),
        makeFindRecord('f', 10, './src/index.ts')
      ].join('')
    );
    const sandbox = makeSandbox({ execute });

    const result = await listSandboxDirectoryRecursive(sandbox, '.');

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][0]).toContain('find');
    expect(execute.mock.calls[0][0]).toContain('-exec sh -c');
    expect(execute.mock.calls[0][0]).toContain('printf "%s\\t%s\\t%s\\0"');
    expect(result).toEqual({
      files: [
        {
          name: 'src',
          path: 'src',
          type: 'directory',
          size: undefined,
          level: 0,
          children: [
            {
              name: 'components',
              path: 'src/components',
              type: 'directory',
              size: undefined,
              level: 1,
              children: [
                {
                  name: 'Button.tsx',
                  path: 'src/components/Button.tsx',
                  type: 'file',
                  size: 12,
                  level: 2
                }
              ],
              loaded: true
            },
            {
              name: 'index.ts',
              path: 'src/index.ts',
              type: 'file',
              size: 10,
              level: 1
            }
          ],
          loaded: true
        },
        {
          name: 'a.txt',
          path: 'a.txt',
          type: 'file',
          size: 1,
          level: 0
        },
        {
          name: 'b.txt',
          path: 'b.txt',
          type: 'file',
          size: 2,
          level: 0
        }
      ],
      expandedPaths: ['src']
    });
  });

  it('将 excludeNames 转成 find prune 条件', async () => {
    const execute = makeExecuteSuccess(
      [
        makeFindRecord('d', 96, '.'),
        makeFindRecord('d', 64, './src'),
        makeFindRecord('f', 10, './src/app.ts')
      ].join('')
    );
    const sandbox = makeSandbox({ execute });

    const result = await listSandboxDirectoryRecursive(sandbox, '.', {
      excludeNames: ['node_modules']
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][0]).toContain("-name 'node_modules'");
    expect(execute.mock.calls[0][0]).toContain('-prune -o');
    expect(result.files).toEqual([
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        size: undefined,
        level: 0,
        children: [
          {
            name: 'app.ts',
            path: 'src/app.ts',
            type: 'file',
            size: 10,
            level: 1
          }
        ],
        loaded: true
      }
    ]);
  });

  it('达到 maxDepth 时保留目录节点但不继续递归', async () => {
    const execute = makeExecuteSuccess(
      [makeFindRecord('d', 96, '.'), makeFindRecord('d', 64, './src')].join('')
    );
    const sandbox = makeSandbox({ execute });

    const result = await listSandboxDirectoryRecursive(sandbox, '.', { maxDepth: 0 });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][0]).toContain('-maxdepth 1');
    expect(result).toEqual({
      files: [
        {
          name: 'src',
          path: 'src',
          type: 'directory',
          size: undefined,
          level: 0,
          children: [],
          loaded: false
        }
      ],
      expandedPaths: []
    });
  });

  it('find 命令失败时抛出 stderr 中的错误信息', async () => {
    const execute = vi.fn().mockResolvedValue({
      stdout: '',
      stderr: 'find failed',
      exitCode: 1
    });
    const sandbox = makeSandbox({ execute });

    await expect(listSandboxDirectoryRecursive(sandbox, '.')).rejects.toThrow('find failed');
  });

  it('find 输出被截断时抛出错误', async () => {
    const execute = vi.fn().mockResolvedValue({
      stdout: makeFindRecord('d', 96, '.'),
      stderr: '',
      exitCode: 0,
      truncated: true
    });
    const sandbox = makeSandbox({ execute });

    await expect(listSandboxDirectoryRecursive(sandbox, '.')).rejects.toThrow(
      'Sandbox file list output was truncated'
    );
  });
});

// ─── writeSandboxFile ──────────────────────────────────────────────────────

describe('writeSandboxFile', () => {
  it('写入成功时正常返回', async () => {
    const writeFiles = vi.fn().mockResolvedValue([makeWriteResult('/file.txt')]);
    const sandbox = makeSandbox({ writeFiles });
    await expect(writeSandboxFile(sandbox, '/file.txt', 'hello')).resolves.toBeUndefined();
  });

  it('传递正确的 path 和 content 给 provider', async () => {
    const writeFiles = vi.fn().mockResolvedValue([makeWriteResult('/out.py')]);
    const sandbox = makeSandbox({ writeFiles });
    await writeSandboxFile(sandbox, '/out.py', 'print("hi")');
    expect(writeFiles).toHaveBeenCalledWith([{ path: '/out.py', data: 'print("hi")' }]);
  });

  it('写入失败时 reject error', async () => {
    const err = new Error('disk full');
    const writeFiles = vi.fn().mockResolvedValue([makeWriteResult('/file.txt', err)]);
    const sandbox = makeSandbox({ writeFiles });
    await expect(writeSandboxFile(sandbox, '/file.txt', 'data')).rejects.toThrow('disk full');
  });

  it('写入空字符串不会报错', async () => {
    const writeFiles = vi.fn().mockResolvedValue([makeWriteResult('/empty.txt')]);
    const sandbox = makeSandbox({ writeFiles });
    await expect(writeSandboxFile(sandbox, '/empty.txt', '')).resolves.toBeUndefined();
  });

  it('当传入 data:;base64, 格式的内容时，自动将其解码为 Buffer 写入', async () => {
    const writeFiles = vi.fn().mockResolvedValue([makeWriteResult('/image.png')]);
    const sandbox = makeSandbox({ writeFiles });
    const base64Content = 'data:image/png;base64,aGVsbG8='; // "hello" in base64
    await writeSandboxFile(sandbox, '/image.png', base64Content);
    expect(writeFiles).toHaveBeenCalledWith([{ path: '/image.png', data: Buffer.from('hello') }]);
  });
});

// ─── isSandboxPathDirectory ────────────────────────────────────────────────

describe('isSandboxPathDirectory', () => {
  it('getFileInfo 返回 isDirectory:true', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(makeFileInfoMap('/src', { isDirectory: true }))
    });
    expect(await isSandboxPathDirectory(sandbox, '/src')).toBe(true);
  });

  it('getFileInfo 返回 isDirectory:false', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(makeFileInfoMap('/main.py', { isDirectory: false }))
    });
    expect(await isSandboxPathDirectory(sandbox, '/main.py')).toBe(false);
  });

  it('fileInfo 不存在时，path 为 "." 返回 true', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(new Map())
    });
    expect(await isSandboxPathDirectory(sandbox, '.')).toBe(true);
  });

  it('fileInfo 不存在时，path 为 "" 返回 true', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(new Map())
    });
    expect(await isSandboxPathDirectory(sandbox, '')).toBe(true);
  });

  it('fileInfo 不存在时，path 以 "/" 结尾返回 true', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(new Map())
    });
    expect(await isSandboxPathDirectory(sandbox, '/workspace/')).toBe(true);
  });

  it('fileInfo 不存在时，普通文件路径返回 false', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(new Map())
    });
    expect(await isSandboxPathDirectory(sandbox, '/main.py')).toBe(false);
  });

  it('传递正确的 path 数组给 getFileInfo', async () => {
    const getFileInfo = vi.fn().mockResolvedValue(new Map());
    const sandbox = makeSandbox({ getFileInfo });
    await isSandboxPathDirectory(sandbox, '/some/path');
    expect(getFileInfo).toHaveBeenCalledWith(['/some/path']);
  });
});

// ─── getSandboxFileContent ─────────────────────────────────────────────────

describe('getSandboxFileContent', () => {
  it('preview=false 时 contentType 为 application/octet-stream', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/main.py', 'print(1)')])
    });
    const result = await getSandboxFileContent(sandbox, '/main.py', false);
    expect(result.contentType).toBe('application/octet-stream');
  });

  it('preview=undefined 时 contentType 为 application/octet-stream', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/main.py', 'code')])
    });
    const result = await getSandboxFileContent(sandbox, '/main.py');
    expect(result.contentType).toBe('application/octet-stream');
  });

  it('preview=true 且可识别扩展名时返回正确 contentType', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/index.html', '<html/>')])
    });
    const result = await getSandboxFileContent(sandbox, '/index.html', true);
    expect(result.contentType).toBe('text/html');
  });

  it('preview=true 且扩展名无法识别时回退 application/octet-stream', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/foo.unknown123', 'data')])
    });
    const result = await getSandboxFileContent(sandbox, '/foo.unknown123', true);
    expect(result.contentType).toBe('application/octet-stream');
  });

  it('读取失败时 reject', async () => {
    const sandbox = makeSandbox({
      readFiles: vi
        .fn()
        .mockResolvedValue([makeReadResult('/file.txt', '', new Error('not found'))])
    });
    await expect(getSandboxFileContent(sandbox, '/file.txt')).rejects.toThrow(
      'Failed to read file: not found'
    );
  });

  it('正确提取 fileName（路径最后一段）', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/a/b/script.py', 'code')])
    });
    const result = await getSandboxFileContent(sandbox, '/a/b/script.py');
    expect(result.fileName).toBe('script.py');
  });

  it('路径不含 "/" 时 fileName 等于 path 本身', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('readme.md', 'hi')])
    });
    const result = await getSandboxFileContent(sandbox, 'readme.md');
    expect(result.fileName).toBe('readme.md');
  });

  it('content 正确转换为 Buffer', async () => {
    const text = 'hello world';
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/f.txt', text)])
    });
    const result = await getSandboxFileContent(sandbox, '/f.txt');
    expect(result.content).toEqual(Buffer.from(text));
  });

  it('传递正确的 path 数组给 readFiles', async () => {
    const readFiles = vi.fn().mockResolvedValue([makeReadResult('/x.ts', '')]);
    const sandbox = makeSandbox({ readFiles });
    await getSandboxFileContent(sandbox, '/x.ts');
    expect(readFiles).toHaveBeenCalledWith(['/x.ts']);
  });
});

// ─── addDirectoryToArchive ─────────────────────────────────────────────────

describe('addDirectoryToArchive', () => {
  function makeArchive() {
    return { append: vi.fn() } as unknown as import('archiver').Archiver;
  }

  it('空目录不调用 append', async () => {
    const archive = makeArchive();
    const sandbox = makeSandbox({ listDirectory: vi.fn().mockResolvedValue([]) });
    await addDirectoryToArchive(sandbox, archive, '/workspace', '');
    expect(archive.append).not.toHaveBeenCalled();
  });

  it('顶层文件（archivePath 为空）使用 entry.name 作为归档路径', async () => {
    const archive = makeArchive();
    const sandbox = makeSandbox({
      listDirectory: vi.fn().mockResolvedValue([makeDirectoryEntry('main.py', { size: 10 })]),
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/workspace/main.py', 'code')])
    });
    await addDirectoryToArchive(sandbox, archive, '/workspace', '');
    expect(archive.append).toHaveBeenCalledWith(expect.any(Buffer), { name: 'main.py' });
  });

  it('嵌套文件时归档路径包含前缀', async () => {
    const archive = makeArchive();
    const sandbox = makeSandbox({
      listDirectory: vi.fn().mockResolvedValue([makeDirectoryEntry('utils.ts', { size: 50 })]),
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/workspace/src/utils.ts', 'export')])
    });
    await addDirectoryToArchive(sandbox, archive, '/workspace/src', 'src');
    expect(archive.append).toHaveBeenCalledWith(expect.any(Buffer), { name: 'src/utils.ts' });
  });

  it('递归处理子目录', async () => {
    const archive = makeArchive();
    const listDirectory = vi
      .fn()
      .mockResolvedValueOnce([
        makeDirectoryEntry('src', { isDirectory: true, path: '/workspace/src' })
      ])
      .mockResolvedValueOnce([makeDirectoryEntry('index.ts', { path: '/workspace/src/index.ts' })]);
    const readFiles = vi
      .fn()
      .mockResolvedValue([makeReadResult('/workspace/src/index.ts', 'code')]);
    const sandbox = makeSandbox({ listDirectory, readFiles });
    await addDirectoryToArchive(sandbox, archive, '/workspace', '');
    expect(archive.append).toHaveBeenCalledWith(expect.any(Buffer), { name: 'src/index.ts' });
  });

  it('读取失败的文件被跳过，不调用 append', async () => {
    const archive = makeArchive();
    const entries = [makeDirectoryEntry('broken.py', { size: 100 })];
    const sandbox = makeSandbox({
      listDirectory: vi.fn().mockResolvedValue(entries),
      readFiles: vi
        .fn()
        .mockResolvedValue([makeReadResult('/workspace/broken.py', '', new Error('read error'))])
    });
    await addDirectoryToArchive(sandbox, archive, '/workspace', '');
    expect(archive.append).not.toHaveBeenCalled();
  });

  it('混合场景：成功文件和失败文件', async () => {
    const archive = makeArchive();
    const entries = [
      makeDirectoryEntry('ok.py', { path: '/workspace/ok.py' }),
      makeDirectoryEntry('bad.py', { path: '/workspace/bad.py' })
    ];
    const readFiles = vi
      .fn()
      .mockResolvedValueOnce([makeReadResult('/workspace/ok.py', 'print(1)')])
      .mockResolvedValueOnce([makeReadResult('/workspace/bad.py', '', new Error('fail'))]);
    const sandbox = makeSandbox({ listDirectory: vi.fn().mockResolvedValue(entries), readFiles });
    await addDirectoryToArchive(sandbox, archive, '/workspace', '');
    expect(archive.append).toHaveBeenCalledTimes(1);
    expect(archive.append).toHaveBeenCalledWith(expect.any(Buffer), { name: 'ok.py' });
  });

  it('深层嵌套目录递归正确', async () => {
    const archive = makeArchive();
    const listDirectory = vi
      .fn()
      .mockResolvedValueOnce([makeDirectoryEntry('a', { isDirectory: true, path: '/w/a' })])
      .mockResolvedValueOnce([makeDirectoryEntry('b', { isDirectory: true, path: '/w/a/b' })])
      .mockResolvedValueOnce([makeDirectoryEntry('c.txt', { path: '/w/a/b/c.txt' })]);
    const readFiles = vi.fn().mockResolvedValue([makeReadResult('/w/a/b/c.txt', 'deep')]);
    const sandbox = makeSandbox({ listDirectory, readFiles });
    await addDirectoryToArchive(sandbox, archive, '/w', '');
    expect(archive.append).toHaveBeenCalledWith(expect.any(Buffer), { name: 'a/b/c.txt' });
  });

  it('超过最大深度限制时停止递归', async () => {
    const archive = makeArchive();
    const listDirectory = vi
      .fn()
      .mockResolvedValue([makeDirectoryEntry('sub', { isDirectory: true, path: '/w/sub' })]);
    const sandbox = makeSandbox({ listDirectory });
    // depth=21 超过 MAX_ARCHIVE_DEPTH(20)，应直接返回不做任何操作
    await addDirectoryToArchive(sandbox, archive, '/w', '', 21);
    expect(listDirectory).not.toHaveBeenCalled();
    expect(archive.append).not.toHaveBeenCalled();
  });
});
