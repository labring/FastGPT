import { beforeEach, describe, expect, it } from 'vitest';
import { FileOperationError } from '@/errors';
import { CommandPolyfillService } from '@/polyfill/CommandPolyfillService';
import { bytesToBase64 } from '@/utils/base64';
import { MockCommandExecution } from '../../mocks/MockCommandExecution';

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

describe('CommandPolyfillService', () => {
  let mockExecutor: MockCommandExecution;
  let polyfill: CommandPolyfillService;

  beforeEach(() => {
    mockExecutor = new MockCommandExecution();
    polyfill = new CommandPolyfillService(mockExecutor);
  });

  describe('readFile', () => {
    it('should read file via base64 encoding', async () => {
      const expectedContent = 'Hello, World!';
      const base64Content = bytesToBase64(new TextEncoder().encode(expectedContent));

      mockExecutor.mockCommand(`cat ${shellQuote('/test/file.txt')} | base64 -w 0`, {
        stdout: base64Content,
        stderr: '',
        exitCode: 0
      });

      const result = await polyfill.readFile('/test/file.txt');
      const decoded = new TextDecoder().decode(result);

      expect(decoded).toBe(expectedContent);
    });

    it('should throw FileOperationError for non-existent file', async () => {
      mockExecutor.mockCommand(`cat ${shellQuote('/nonexistent')} | base64 -w 0`, {
        stdout: '',
        stderr: 'cat: /nonexistent: No such file or directory',
        exitCode: 1
      });

      try {
        await polyfill.readFile('/nonexistent');
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(FileOperationError);
        expect((error as FileOperationError).fileErrorCode).toBe('FILE_NOT_FOUND');
      }
    });

    it('should throw FileOperationError for permission denied', async () => {
      mockExecutor.mockCommand(`cat ${shellQuote('/secret')} | base64 -w 0`, {
        stdout: '',
        stderr: 'cat: /secret: Permission denied',
        exitCode: 1
      });

      try {
        await polyfill.readFile('/secret');
        expect(false).toBe(true);
      } catch (error) {
        expect(error).toBeInstanceOf(FileOperationError);
        expect((error as FileOperationError).fileErrorCode).toBe('PERMISSION_DENIED');
      }
    });
  });

  describe('writeFile', () => {
    it('should write file via base64 encoding', async () => {
      const content = new TextEncoder().encode('Test content');
      const base64Content = bytesToBase64(content);

      mockExecutor.mockCommand(`mkdir -p ${shellQuote('/test')}`, {
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      mockExecutor.mockCommand(
        `echo "${base64Content}" | base64 -d > ${shellQuote('/test/output.txt')}`,
        {
          stdout: '',
          stderr: '',
          exitCode: 0
        }
      );

      const bytesWritten = await polyfill.writeFile('/test/output.txt', content);
      expect(bytesWritten).toBe(content.length);

      const commands = mockExecutor.getExecutedCommands();
      expect(commands.some((c) => c.command.includes('mkdir -p'))).toBe(true);
      expect(commands.some((c) => c.command.includes('base64 -d'))).toBe(true);
    });

    it('should write text file directly', async () => {
      const text = 'Hello World';
      const base64Content = bytesToBase64(new TextEncoder().encode(text));

      mockExecutor.mockCommand(`mkdir -p ${shellQuote('/test')}`, {
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      mockExecutor.mockCommand(
        `echo "${base64Content}" | base64 -d > ${shellQuote('/test/text.txt')}`,
        {
          stdout: '',
          stderr: '',
          exitCode: 0
        }
      );

      const bytesWritten = await polyfill.writeTextFile('/test/text.txt', text);
      expect(bytesWritten).toBe(11);
    });

    it('should not embed text content into the shell command', async () => {
      const text = 'POLYFILL_EOF\n$(touch /tmp/pwned)';
      const base64Content = bytesToBase64(new TextEncoder().encode(text));

      mockExecutor.mockCommand(`mkdir -p ${shellQuote('/test')}`, {
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      mockExecutor.mockCommand(
        `echo "${base64Content}" | base64 -d > ${shellQuote('/test/text.txt')}`,
        {
          stdout: '',
          stderr: '',
          exitCode: 0
        }
      );

      await polyfill.writeTextFile('/test/text.txt', text);

      const commands = mockExecutor.getExecutedCommands().map(({ command }) => command);
      expect(commands.some((command) => command.includes('POLYFILL_EOF'))).toBe(false);
      expect(commands.some((command) => command.includes('touch /tmp/pwned'))).toBe(false);
    });
  });

  describe('deleteFiles', () => {
    it('should delete multiple files', async () => {
      mockExecutor.mockCommand(`rm -f ${shellQuote('/file1.txt')}`, {
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      mockExecutor.mockCommand(`rm -f ${shellQuote('/file2.txt')}`, {
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      const results = await polyfill.deleteFiles(['/file1.txt', '/file2.txt']);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should report failures for files that cannot be deleted', async () => {
      mockExecutor.mockCommand(`rm -f ${shellQuote('/protected')}`, {
        stdout: '',
        stderr: 'rm: cannot remove',
        exitCode: 1
      });

      const results = await polyfill.deleteFiles(['/protected']);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toBeDefined();
    });

    it('should single-quote paths so command substitutions are not evaluated', async () => {
      const path = "/workspace/$(touch /tmp/pwned)'`echo bad`.txt";

      await polyfill.deleteFiles([path]);

      expect(mockExecutor.getExecutedCommands()[0].command).toBe(`rm -f ${shellQuote(path)}`);
    });
  });

  describe('createDirectories', () => {
    it('should create directories with mkdir -p', async () => {
      mockExecutor.mockCommand(`mkdir -p ${shellQuote('/new/dir')}`, {
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      await polyfill.createDirectories(['/new/dir']);

      const commands = mockExecutor.getExecutedCommands();
      expect(commands[0].command).toBe(`mkdir -p ${shellQuote('/new/dir')}`);
    });

    it('should set permissions when specified', async () => {
      mockExecutor.mockCommand(`mkdir -p ${shellQuote('/new/dir')}`, {
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      mockExecutor.mockCommand(`chmod 755 ${shellQuote('/new/dir')}`, {
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      await polyfill.createDirectories(['/new/dir'], { mode: 0o755 });

      const commands = mockExecutor.getExecutedCommands();
      expect(commands.some((c) => c.command.includes('chmod 755'))).toBe(true);
    });
  });

  describe('listDirectory', () => {
    it('should parse ls -la output', async () => {
      const lsOutput = `total 12
drwxr-xr-x 2 user group 4096 2024-01-15T10:30:00 .
drwxr-xr-x 3 user group 4096 2024-01-15T10:30:00 ..
-rw-r--r-- 1 user group  123 2024-01-15T11:00:00 file.txt
drwxr-xr-x 2 user group 4096 2024-01-15T10:45:00 subdir`;

      mockExecutor.mockCommand(
        `ls -la ${shellQuote('/test')} --time-style=+"%Y-%m-%dT%H:%M:%S" 2>/dev/null || echo "DIRECTORY_NOT_FOUND"`,
        {
          stdout: lsOutput,
          stderr: '',
          exitCode: 0
        }
      );

      const entries = await polyfill.listDirectory('/test');

      expect(entries).toHaveLength(2); // . and .. excluded
      expect(entries.find((e) => e.name === 'file.txt')?.isFile).toBe(true);
      expect(entries.find((e) => e.name === 'subdir')?.isDirectory).toBe(true);
    });

    it('should throw FileOperationError for non-existent directory', async () => {
      mockExecutor.mockCommand(
        `ls -la ${shellQuote('/nonexistent')} --time-style=+"%Y-%m-%dT%H:%M:%S" 2>/dev/null || echo "DIRECTORY_NOT_FOUND"`,
        {
          stdout: 'DIRECTORY_NOT_FOUND',
          stderr: '',
          exitCode: 0
        }
      );
      mockExecutor.mockCommand(
        `ls -la ${shellQuote('/nonexistent')} 2>/dev/null || echo "DIRECTORY_NOT_FOUND"`,
        {
          stdout: 'DIRECTORY_NOT_FOUND',
          stderr: '',
          exitCode: 0
        }
      );

      try {
        await polyfill.listDirectory('/nonexistent');
        expect(false).toBe(true);
      } catch (error) {
        expect(error).toBeInstanceOf(FileOperationError);
      }
    });
  });

  describe('getFileInfo', () => {
    it('should parse stat output', async () => {
      // Format: size|mtime|ctime|mode|user|group|type
      mockExecutor.mockCommand(
        `stat -c '%s|%Y|%W|%a|%U|%G|%F' ${shellQuote('/test/file.txt')} 2>/dev/null || echo "STAT_FAILED"`,
        {
          stdout: '1234|1705312200|1705311000|644|user|group|regular file',
          stderr: '',
          exitCode: 0
        }
      );

      const info = await polyfill.getFileInfo(['/test/file.txt']);

      expect(info.has('/test/file.txt')).toBe(true);
      const fileInfo = info.get('/test/file.txt');
      expect(fileInfo).toBeDefined();
      expect(fileInfo?.size).toBe(1234);
      expect(fileInfo?.isFile).toBe(true);
      expect(fileInfo?.mode).toBe(0o644);
    });
  });

  describe('search', () => {
    it('should use find command for search', async () => {
      mockExecutor.mockCommand(
        `find ${shellQuote('/home')} -name ${shellQuote('*.txt')} -print 2>/dev/null || echo "FIND_FAILED"`,
        {
          stdout: '/home/file1.txt\n/home/file2.txt',
          stderr: '',
          exitCode: 0
        }
      );

      const results = await polyfill.search('*.txt', '/home');

      expect(results).toHaveLength(2);
      expect(results[0].path).toBe('/home/file1.txt');
      expect(results[1].path).toBe('/home/file2.txt');
    });

    it('should fallback to ls + grep if find not available', async () => {
      mockExecutor.mockCommand(
        `find ${shellQuote('/home')} -name ${shellQuote('*.log')} -print 2>/dev/null || echo "FIND_FAILED"`,
        {
          stdout: 'FIND_FAILED',
          stderr: '',
          exitCode: 0
        }
      );

      mockExecutor.mockCommand(
        `ls -R ${shellQuote('/home')} 2>/dev/null | grep -E ${shellQuote('*.log')} || true`,
        {
          stdout: 'app.log\nerror.log',
          stderr: '',
          exitCode: 0
        }
      );

      const results = await polyfill.search('*.log', '/home');

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('ping', () => {
    it('should return true for healthy sandbox', async () => {
      mockExecutor.mockCommand('echo "PING"', {
        stdout: 'PING',
        stderr: '',
        exitCode: 0
      });

      const result = await polyfill.ping();
      expect(result).toBe(true);
    });

    it('should return false for unhealthy sandbox', async () => {
      mockExecutor.mockCommand('echo "PING"', {
        stdout: '',
        stderr: 'Connection refused',
        exitCode: 1
      });

      const result = await polyfill.ping();
      expect(result).toBe(false);
    });
  });

  describe('getMetrics', () => {
    it('should parse /proc information', async () => {
      mockExecutor.mockCommand('nproc 2>/dev/null || echo "1"', {
        stdout: '4',
        stderr: '',
        exitCode: 0
      });

      mockExecutor.mockCommand('cat /proc/meminfo 2>/dev/null || echo "FAILED"', {
        stdout: `MemTotal:       8192000 kB
MemFree:        4096000 kB
MemAvailable:   6144000 kB`,
        stderr: '',
        exitCode: 0
      });

      const metrics = await polyfill.getMetrics();

      expect(metrics.cpuCount).toBe(4);
      expect(metrics.memoryTotalMiB).toBe(8000);
      expect(metrics.memoryUsedMiB).toBe(2000);
      expect(metrics.timestamp).toBeGreaterThan(0);
    });
  });
});
