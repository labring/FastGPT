import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ICommandExecution } from '@/contracts';
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

  it('chunks encoded writes without interpolating source text', async () => {
    const { execute, polyfill } = setup();
    const content = '$(touch /tmp/pwned)\n'.repeat(100);
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

  it('maps provider stat metadata to the public file shape', async () => {
    const { execute, polyfill } = setup();
    execute.mockResolvedValueOnce(
      commandResult('1234|1705312200|1705311000|644|user|group|regular file')
    );

    const info = await polyfill.getFileInfo(['/workspace/file.txt']);

    expect(info.get('/workspace/file.txt')).toMatchObject({
      path: '/workspace/file.txt',
      size: 1234,
      mode: 0o644,
      owner: 'user',
      group: 'group',
      isFile: true,
      isDirectory: false
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
    const setupShell = async (content: string) => {
      const dir = await mkdtemp(join(tmpdir(), 'command-fs-'));
      const path = join(dir, 'file.txt');
      await writeFile(path, content, { mode: 0o640 });

      const executor = {
        execute: async (command: string): Promise<ExecuteResult> =>
          new Promise((resolve) => {
            execFile('sh', ['-c', command], (error, stdout, stderr) => {
              resolve(commandResult(stdout, stderr, error ? Number(error.code ?? 1) : 0));
            });
          }),
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
