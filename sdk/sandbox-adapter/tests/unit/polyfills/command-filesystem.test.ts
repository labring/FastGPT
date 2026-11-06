import { execFile } from 'node:child_process';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ICommandExecution } from '@/contracts';
import { CommandExecutionError, ConnectionError, FileOperationError } from '@/errors';
import { CommandFilesystemPolyfill } from '@/polyfills/command-filesystem';
import type { ExecuteResult } from '@/types';

describe('CommandFilesystemPolyfill', () => {
  const commandResult = (stdout = '', stderr = '', exitCode: number | null = 0): ExecuteResult => ({
    stdout,
    stderr,
    exitCode
  });

  const setup = () => {
    const execute = vi.fn(async (_command: string): Promise<ExecuteResult> => commandResult());
    const executor = {
      execute,
      executeStream: vi.fn(async () => {}),
      executeBackground: vi.fn(async () => ({
        sessionId: 'test-session',
        kill: async () => {}
      })),
      interrupt: vi.fn(async () => {})
    } satisfies ICommandExecution;

    return { execute, polyfill: new CommandFilesystemPolyfill(executor) };
  };

  it('reads known-size files through a bounded byte range', async () => {
    const { execute, polyfill } = setup();
    execute.mockResolvedValueOnce(commandResult('3')).mockResolvedValueOnce(commandResult('AP8B'));

    await expect(polyfill.readFile('/workspace/file.bin')).resolves.toEqual(
      new Uint8Array([0, 255, 1])
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      "tail -c +1 '/workspace/file.bin' | head -c 3 | base64 -w 0"
    );
  });

  it('maps read failures to file error context', async () => {
    const { execute, polyfill } = setup();
    execute
      .mockResolvedValueOnce(commandResult('STAT_FAILED'))
      .mockResolvedValueOnce(commandResult('', 'cat: Permission denied', 1));

    await expect(polyfill.readFile('/workspace/secret')).rejects.toMatchObject({
      path: '/workspace/secret',
      fileErrorCode: 'PERMISSION_DENIED'
    });
  });

  it('refuses a fallback read whose output was truncated', async () => {
    const { execute, polyfill } = setup();
    execute
      .mockResolvedValueOnce(commandResult('STAT_FAILED'))
      .mockResolvedValueOnce({ ...commandResult('b2xkCg=='), truncated: true });

    await expect(
      polyfill.replaceContent([{ path: '/workspace/big.txt', oldContent: 'old', newContent: '' }])
    ).rejects.toMatchObject({ path: '/workspace/big.txt', fileErrorCode: 'TRANSFER_ERROR' });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not replace a symlink it cannot resolve', async () => {
    const { execute, polyfill } = setup();
    execute
      .mockResolvedValueOnce(commandResult('4'))
      .mockResolvedValueOnce(commandResult('b2xkCg=='))
      .mockResolvedValueOnce(commandResult('', 'sh: readlink: not found', 127));

    await expect(
      polyfill.replaceContent([
        { path: '/workspace/link.txt', oldContent: 'old', newContent: 'new' }
      ])
    ).rejects.toMatchObject({ path: '/workspace/link.txt' });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('chunks encoded writes without interpolating source text', async () => {
    const { execute, polyfill } = setup();
    const content = '$(touch /tmp/pwned)\n'.repeat(3000);
    const byteLength = new TextEncoder().encode(content).byteLength;

    await expect(polyfill.writeTextFile('/workspace/file.txt', content)).resolves.toBe(byteLength);

    const writeCommands = execute.mock.calls
      .map(([command]) => command)
      .filter((command) => command.includes('base64 -d'));
    expect(writeCommands.length).toBeGreaterThan(1);
    expect(writeCommands[0]).toContain(' > ');
    expect(writeCommands[1]).toContain(' >> ');
    expect(writeCommands.every((command) => !command.includes('touch /tmp/pwned'))).toBe(true);
  });

  it('returns ordered deletion outcomes without aborting the batch', async () => {
    const { execute, polyfill } = setup();
    const unsafePath = "/workspace/$(touch /tmp/pwned)'`echo bad`.txt";
    execute
      .mockResolvedValueOnce(commandResult())
      .mockResolvedValueOnce(commandResult('', 'permission denied', 1))
      .mockRejectedValueOnce(new Error('transport failed'));

    const results = await polyfill.deleteFiles([
      '/workspace/ok',
      '/workspace/protected',
      unsafePath
    ]);

    expect(results).toMatchObject([
      { path: '/workspace/ok', success: true },
      { path: '/workspace/protected', success: false, error: expect.any(Error) },
      { path: unsafePath, success: false, error: expect.any(Error) }
    ]);
    expect(execute).toHaveBeenLastCalledWith(
      "rm -f '/workspace/$(touch /tmp/pwned)'\\''`echo bad`.txt'"
    );
  });

  it('parses portable directory entries and reports missing directories', async () => {
    const { execute, polyfill } = setup();
    execute.mockResolvedValueOnce(
      commandResult(`total 12
drwxr-xr-x 2 user group 4096 2024-01-15T10:30:00 .
drwxr-xr-x 3 user group 4096 2024-01-15T10:30:00 ..
-rw-r--r-- 1 user group 123 2024-01-15T11:00:00 file.txt
drwxr-xr-x 2 user group 4096 2024-01-15T10:45:00 subdir`)
    );

    await expect(polyfill.listDirectory('/workspace')).resolves.toMatchObject([
      { name: 'file.txt', path: '/workspace/file.txt', isFile: true },
      { name: 'subdir', path: '/workspace/subdir', isDirectory: true }
    ]);

    execute.mockResolvedValue(commandResult('DIRECTORY_NOT_FOUND'));
    await expect(polyfill.listDirectory('/workspace/missing')).rejects.toMatchObject({
      path: '/workspace/missing',
      fileErrorCode: 'FILE_NOT_FOUND'
    });
  });

  describe('getFileInfo', () => {
    const path = '/workspace/file.txt';
    const metadata = '1234|1705312200|1705311000|644|user|group|regular file';
    const missing = commandResult(
      '',
      `stat: cannot statx '${path}': No such file or directory\n`,
      1
    );
    const denied = commandResult('', `stat: cannot statx '${path}': Permission denied\n`, 1);

    it('maps complete stat metadata to the public file shape', async () => {
      const { execute, polyfill } = setup();
      execute.mockResolvedValueOnce(commandResult(`${metadata}\n`));

      const info = await polyfill.getFileInfo([path]);

      expect(info.get(path)).toEqual({
        path,
        size: 1234,
        modifiedAt: new Date(1705312200000),
        createdAt: new Date(1705311000000),
        mode: 0o644,
        owner: 'user',
        group: 'group',
        isFile: true,
        isDirectory: false,
        isSymlink: false
      });
    });

    it('keeps zero size and mode and accepts epoch and pre-epoch timestamps', async () => {
      const { execute, polyfill } = setup();
      execute.mockResolvedValueOnce(commandResult('0|0|-1|0|user|group|regular empty file'));

      const info = await polyfill.getFileInfo([path]);

      expect(info.get(path)).toMatchObject({
        size: 0,
        mode: 0,
        modifiedAt: new Date(0),
        createdAt: new Date(-1000),
        isFile: true
      });
    });

    it.each([
      ['directory', true, false],
      ['symbolic link', false, true],
      ['block special file', false, false],
      ['character special file', false, false],
      ['fifo', false, false],
      ['socket', false, false]
    ])('preserves valid %s metadata', async (fileType, isDirectory, isSymlink) => {
      const { execute, polyfill } = setup();
      execute.mockResolvedValueOnce(commandResult(`0|0|0|600|user|group|${fileType}\n`));

      const info = await polyfill.getFileInfo([path]);

      expect(info.get(path)).toMatchObject({ size: 0, isDirectory, isSymlink, isFile: false });
    });

    it.each(['stat', 'statx'])(
      'omits only confirmed ENOENT from %s in a mixed batch',
      async (operation) => {
        const { execute, polyfill } = setup();
        const missingPath = '/workspace/missing parent/file.txt';
        execute
          .mockResolvedValueOnce(commandResult(metadata))
          .mockResolvedValueOnce(
            commandResult(
              '',
              `stat: cannot ${operation} '${missingPath}': No such file or directory\n`,
              1
            )
          )
          .mockResolvedValueOnce(commandResult(metadata));

        const info = await polyfill.getFileInfo([path, missingPath, '/workspace/other.txt']);

        expect([...info.keys()]).toEqual([path, '/workspace/other.txt']);
        expect(execute).toHaveBeenCalledTimes(3);
      }
    );

    it('throws permission errors even when the path contains missing-file diagnostic text', async () => {
      const { execute, polyfill } = setup();
      const protectedPath = '/workspace/No such file or directory';
      const stderr = `stat: cannot statx '${protectedPath}': Permission denied\n`;
      execute.mockResolvedValueOnce(commandResult('', stderr, 1));

      await expect(polyfill.getFileInfo([protectedPath])).rejects.toMatchObject({
        path: protectedPath,
        fileErrorCode: 'PERMISSION_DENIED',
        cause: expect.objectContaining({ exitCode: 1, stderr })
      });
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['missing stat executable', commandResult('', 'sh: stat: not found\n', 127)],
      ['unsupported stat option', commandResult('', "stat: invalid option -- 'c'\n", 1)],
      [
        'non-directory ancestor',
        commandResult('', `stat: cannot statx '${path}': Not a directory\n`, 1)
      ],
      ['unconfirmed ENOENT text', commandResult('', 'No such file or directory\n', 1)],
      ['multiple diagnostics', commandResult('', `stat: command failed\n${missing.stderr}`, 1)],
      ['unknown exit status', { ...missing, exitCode: null }],
      ['command termination', { ...missing, exitCode: 137 }],
      ['partial stdout on failure', { ...missing, stdout: metadata }],
      ['failure without diagnostics', commandResult('', '', 1)]
    ])('rejects %s without retrying or interpreting it as missing', async (_, result) => {
      const { execute, polyfill } = setup();
      execute.mockResolvedValueOnce(result);

      await expect(polyfill.getFileInfo([path])).rejects.toBeInstanceOf(CommandExecutionError);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it.each([
      new Error('transport failed'),
      new ConnectionError('connection lost'),
      new CommandExecutionError('execution failed', 'stat', 1, '', missing.stderr)
    ])('propagates executor rejection unchanged: %s', async (error) => {
      const { execute, polyfill } = setup();
      execute.mockRejectedValueOnce(error);

      await expect(polyfill.getFileInfo([path])).rejects.toBe(error);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it.each([commandResult(metadata), missing])(
      'rejects truncated output before interpreting it',
      async (result) => {
        const { execute, polyfill } = setup();
        execute.mockResolvedValueOnce({ ...result, truncated: true });

        await expect(polyfill.getFileInfo([path])).rejects.toMatchObject({
          path,
          fileErrorCode: 'TRANSFER_ERROR'
        });
        expect(execute).toHaveBeenCalledTimes(1);
      }
    );

    it.each([
      '',
      'STAT_FAILED',
      '1234|1705312200|1705311000|644|user|group',
      `${metadata}|extra`,
      `${metadata}\n\n`,
      '12bytes|0|0|644|user|group|regular file',
      '-1|0|0|644|user|group|regular file',
      '9007199254740993|0|0|644|user|group|regular file',
      '0|not-a-date|0|644|user|group|regular file',
      '0|8640000000001|0|644|user|group|regular file',
      '0|0|8640000000001|644|user|group|regular file',
      '0|0|0|888|user|group|regular file',
      '0|0|0|644||group|regular file',
      '0|0|0|644|user||regular file',
      '0|0|0|644|user|group|regular'
    ])('rejects invalid metadata instead of returning an incomplete map: %j', async (stdout) => {
      const { execute, polyfill } = setup();
      execute.mockResolvedValueOnce(commandResult(stdout));

      await expect(polyfill.getFileInfo([path])).rejects.toMatchObject({
        path,
        fileErrorCode: 'TRANSFER_ERROR'
      });
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('rejects unexpected diagnostics even with a successful exit and valid metadata', async () => {
      const { execute, polyfill } = setup();
      execute.mockResolvedValueOnce(commandResult(metadata, denied.stderr));

      await expect(polyfill.getFileInfo([path])).rejects.toBeInstanceOf(FileOperationError);
    });

    it.each([
      denied,
      commandResult('', 'sh: stat: not found\n', 127),
      commandResult('invalid metadata'),
      { ...missing, truncated: true },
      new ConnectionError('connection lost after the first path')
    ])('rejects the whole batch after an earlier path succeeded: %j', async (failure) => {
      const { execute, polyfill } = setup();
      execute.mockResolvedValueOnce(commandResult(metadata));
      if (failure instanceof Error) {
        execute.mockRejectedValueOnce(failure);
      } else {
        execute.mockResolvedValueOnce(failure);
      }

      await expect(
        polyfill.getFileInfo(['/workspace/first.txt', path, '/workspace/unqueried.txt'])
      ).rejects.toThrow();
      expect(execute).toHaveBeenCalledTimes(2);
    });

    it('quotes spaces, apostrophes and shell substitutions in paths', async () => {
      const { execute, polyfill } = setup();
      const unsafePath = "/workspace/with space'$(touch injected)`echo bad`.txt";
      execute.mockResolvedValueOnce(commandResult(metadata));

      const info = await polyfill.getFileInfo([unsafePath]);

      expect(info.has(unsafePath)).toBe(true);
      expect(execute).toHaveBeenCalledWith(
        "LC_ALL=C stat -c '%s|%Y|%W|%a|%U|%G|%F' -- '/workspace/with space'\\''$(touch injected)`echo bad`.txt'"
      );
    });

    describe.skipIf(process.platform !== 'linux')('with real GNU stat', () => {
      const setupShell = (directory: string) => {
        const { execute, polyfill } = setup();
        execute.mockImplementation(
          (command) =>
            new Promise((resolve, reject) => {
              execFile('sh', ['-c', command], { cwd: directory }, (error, stdout, stderr) => {
                if (error && typeof error.code !== 'number') {
                  reject(error);
                  return;
                }
                resolve(commandResult(stdout, stderr, error ? Number(error.code) : 0));
              });
            })
        );
        return { execute, polyfill };
      };

      it('distinguishes actual missing paths from empty files and dangling symlinks safely', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'command-stat-'));
        const filePath = join(directory, 'space \' "$(touch injected)" `touch injected`.txt');
        const linkPath = join(directory, 'dangling link');
        const missingPath = join(directory, 'missing parent', 'file.txt');
        const { polyfill } = setupShell(directory);
        try {
          await writeFile(filePath, '');
          await chmod(filePath, 0o000);
          await symlink('missing target', linkPath);

          const info = await polyfill.getFileInfo([filePath, missingPath, linkPath]);

          expect([...info.keys()]).toEqual([filePath, linkPath]);
          expect(info.get(filePath)).toMatchObject({ size: 0, mode: 0, isFile: true });
          expect(info.get(linkPath)).toMatchObject({ isSymlink: true, isFile: false });
          expect((await readdir(directory)).sort()).toEqual([
            'dangling link',
            'space \' "$(touch injected)" `touch injected`.txt'
          ]);
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      });

      it.skipIf(process.getuid?.() === 0)(
        'throws for an existing file behind a non-searchable directory',
        async () => {
          const directory = await mkdtemp(join(tmpdir(), 'command-stat-'));
          const protectedDirectory = join(directory, 'No such file or directory');
          const filePath = join(protectedDirectory, 'file.txt');
          const { execute, polyfill } = setupShell(directory);
          await mkdir(protectedDirectory);
          try {
            await writeFile(filePath, 'existing data');
            await chmod(protectedDirectory, 0o000);

            await expect(polyfill.getFileInfo([filePath])).rejects.toMatchObject({
              path: filePath,
              fileErrorCode: 'PERMISSION_DENIED'
            });
            expect(execute).toHaveBeenCalledTimes(1);
          } finally {
            await chmod(protectedDirectory, 0o700);
            await rm(directory, { recursive: true, force: true });
          }
        }
      );
    });
  });

  it('falls back to recursive listing when find is unavailable', async () => {
    const { execute, polyfill } = setup();
    execute
      .mockResolvedValueOnce(commandResult('FIND_FAILED'))
      .mockResolvedValueOnce(commandResult('app.log\nerror.log'));

    await expect(polyfill.search('*.log', '/workspace')).resolves.toEqual([
      { path: '/workspace/app.log' },
      { path: '/workspace/error.log' }
    ]);
  });

  it('derives resource metrics from provider proc data', async () => {
    const { execute, polyfill } = setup();
    execute.mockResolvedValueOnce(commandResult('4')).mockResolvedValueOnce(
      commandResult(`MemTotal:       8192000 kB
MemAvailable:   6144000 kB`)
    );

    await expect(polyfill.getMetrics()).resolves.toMatchObject({
      cpuCount: 4,
      cpuUsedPercentage: 0,
      memoryTotalMiB: 8000,
      memoryUsedMiB: 2000,
      timestamp: expect.any(Number)
    });
  });

  describe.skipIf(process.platform === 'win32')('replaceContent', () => {
    // 用真实 sh 执行命令，验证文件最终内容，而不是断言拼出的命令字符串。
    const setupShell = async (
      content: string | Uint8Array,
      // 返回 true 时模拟该次命令的传输失败
      failCommand: (command: string) => boolean = () => false
    ) => {
      const dir = await mkdtemp(join(tmpdir(), 'command-fs-'));
      const path = join(dir, 'file.txt');
      await writeFile(path, content);
      // 显式 chmod，避免宿主 umask 影响初始权限
      await chmod(path, 0o640);

      const executor = {
        execute: async (command: string): Promise<ExecuteResult> => {
          if (failCommand(command)) throw new Error('connection lost');
          return new Promise((resolve) => {
            execFile('sh', ['-c', command], (error, stdout, stderr) => {
              resolve(commandResult(stdout, stderr, error ? Number(error.code ?? 1) : 0));
            });
          });
        },
        executeStream: vi.fn(async () => {}),
        executeBackground: vi.fn(async () => ({
          sessionId: 'test-session',
          kill: async () => {}
        })),
        interrupt: vi.fn(async () => {})
      } satisfies ICommandExecution;

      return {
        path,
        polyfill: new CommandFilesystemPolyfill(executor),
        read: () => readFile(path, 'utf8'),
        dir,
        listDir: () => readdir(dir),
        cleanup: () => rm(dir, { recursive: true, force: true })
      };
    };

    it('replaces text containing regex characters and backslashes literally', async () => {
      const { path, polyfill, read, cleanup } = await setupShell(
        'const re = /a.b*/;\nconst p = "C:\\tmp\\[x]";\nconst t = `${cost}$`;\naxbb\n'
      );
      try {
        await polyfill.replaceContent([
          { path, oldContent: '/a.b*/', newContent: '/a\\.b+/' },
          { path, oldContent: '"C:\\tmp\\[x]"', newContent: '"D:\\data & more"' },
          { path, oldContent: '`${cost}$`', newContent: '`$1 & \\n`' }
        ]);

        await expect(read()).resolves.toBe(
          'const re = /a\\.b+/;\nconst p = "D:\\data & more";\nconst t = `$1 & \\n`;\naxbb\n'
        );
      } finally {
        await cleanup();
      }
    });

    it('replaces multi-line and repeated text and keeps the file mode', async () => {
      const { path, polyfill, read, cleanup } = await setupShell(
        'function a() {\n  return 1;\n}\nfunction a() {\n  return 1;\n}\nend\n'
      );
      try {
        await polyfill.replaceContent([
          { path, oldContent: '{\n  return 1;\n}', newContent: '{\n  return 2;\n}' }
        ]);

        await expect(read()).resolves.toBe(
          'function a() {\n  return 2;\n}\nfunction a() {\n  return 2;\n}\nend\n'
        );
        expect((await stat(path)).mode & 0o777).toBe(0o640);
      } finally {
        await cleanup();
      }
    });

    it('keeps the original file when a write fails partway through', async () => {
      const original = `${'0123456789abcdef'.repeat(6200)}old\n`;
      let appends = 0;
      const { path, polyfill, read, listDir, cleanup } = await setupShell(original, (command) =>
        command.includes('base64 -d >>') ? ++appends === 2 : false
      );
      try {
        await expect(
          polyfill.replaceContent([{ path, oldContent: 'old', newContent: 'new' }])
        ).rejects.toThrow('connection lost');

        await expect(read()).resolves.toBe(original);
        await expect(listDir()).resolves.toEqual(['file.txt']);
      } finally {
        await cleanup();
      }
    });

    it('keeps the original file when the final rename fails', async () => {
      const original = 'keep the old line\n';
      const { path, polyfill, read, listDir, cleanup } = await setupShell(original, (command) =>
        command.startsWith('mv -f')
      );
      try {
        await expect(
          polyfill.replaceContent([{ path, oldContent: 'old', newContent: 'new' }])
        ).rejects.toThrow('connection lost');

        await expect(read()).resolves.toBe(original);
        await expect(listDir()).resolves.toEqual(['file.txt']);
      } finally {
        await cleanup();
      }
    });

    it.each([
      ['longer', `old\n${'valuable line\n'.repeat(4)}`],
      ['shorter', 'old\n']
    ])('edits the file a symlink points to when it is %s than the link', async (_, content) => {
      const { path, polyfill, read, dir, cleanup } = await setupShell(content);
      const link = join(dir, 'link.txt');
      await symlink('file.txt', link);
      try {
        await polyfill.replaceContent([{ path: link, oldContent: 'old', newContent: 'new' }]);

        await expect(read()).resolves.toBe(content.replace('old', 'new'));
        expect((await lstat(link)).isSymbolicLink()).toBe(true);
        expect((await stat(path)).mode & 0o777).toBe(0o640);
        expect((await readdir(dir)).sort()).toEqual(['file.txt', 'link.txt']);
      } finally {
        await cleanup();
      }
    });

    it('edits a file whose name is close to the length limit', async () => {
      const { polyfill, dir, cleanup } = await setupShell('');
      const path = join(dir, `${'n'.repeat(240)}.txt`);
      await writeFile(path, 'old\n');
      try {
        await polyfill.replaceContent([{ path, oldContent: 'old', newContent: 'new' }]);

        await expect(readFile(path, 'utf8')).resolves.toBe('new\n');
        expect((await readdir(dir)).sort()).toEqual(['file.txt', `${'n'.repeat(240)}.txt`]);
      } finally {
        await cleanup();
      }
    });

    it.skipIf(process.getuid?.() === 0)('reports a file it cannot read', async () => {
      const { path, polyfill, cleanup } = await setupShell('old\n');
      try {
        await chmod(path, 0o000);
        await expect(
          polyfill.replaceContent([{ path, oldContent: 'old', newContent: 'new' }])
        ).rejects.toMatchObject({ fileErrorCode: 'PERMISSION_DENIED' });
      } finally {
        await chmod(path, 0o640);
        await cleanup();
      }
    });

    it('keeps a UTF-8 BOM and rejects text that is not UTF-8', async () => {
      const bom = await setupShell('\uFEFFconst answer = 1;\n');
      try {
        await bom.polyfill.replaceContent([{ path: bom.path, oldContent: '1', newContent: '2' }]);
        await expect(readFile(bom.path)).resolves.toEqual(Buffer.from('\uFEFFconst answer = 2;\n'));
      } finally {
        await bom.cleanup();
      }

      const latin1 = Buffer.from('caf\xe9 old\n', 'latin1');
      const binary = await setupShell(latin1);
      try {
        await expect(
          binary.polyfill.replaceContent([
            { path: binary.path, oldContent: 'old', newContent: 'new' }
          ])
        ).rejects.toMatchObject({ fileErrorCode: 'TRANSFER_ERROR' });
        await expect(readFile(binary.path)).resolves.toEqual(latin1);
      } finally {
        await binary.cleanup();
      }
    });

    it('rejects an empty search string and reports missing files', async () => {
      const { path, polyfill, read, cleanup } = await setupShell('keep\n');
      try {
        await expect(
          polyfill.replaceContent([{ path, oldContent: '', newContent: 'x' }])
        ).rejects.toMatchObject({ path, fileErrorCode: 'INVALID_PATH' });
        await expect(polyfill.readFile(`${path}.missing`)).rejects.toMatchObject({
          fileErrorCode: 'FILE_NOT_FOUND'
        });
        await expect(
          polyfill.replaceContent([{ path: `${path}.missing`, oldContent: 'a', newContent: 'b' }])
        ).rejects.toMatchObject({ fileErrorCode: 'FILE_NOT_FOUND' });
        await expect(read()).resolves.toBe('keep\n');
      } finally {
        await cleanup();
      }
    });
  });
});
