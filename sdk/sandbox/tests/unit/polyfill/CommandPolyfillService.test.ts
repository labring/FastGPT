import { beforeEach, describe, expect, it } from 'vitest';
import { FileOperationError } from '../../../src/errors';
import { CommandPolyfillService } from '../../../src/polyfill/CommandPolyfillService';
import { bytesToBase64 } from '../../../src/utils/base64';
import { MockCommandExecution } from '../../mocks/MockCommandExecution';

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

      mockExecutor.mockCommand('cat "/test/file.txt" | base64 -w 0', {
        stdout: base64Content,
        stderr: '',
        exitCode: 0
      });

      const result = await polyfill.readFile('/test/file.txt');
      const decoded = new TextDecoder().decode(result);

      expect(decoded).toBe(expectedContent);
    });

    it('should throw FileOperationError for non-existent file', async () => {
      mockExecutor.mockCommand('cat "/nonexistent" | base64 -w 0', {
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
      mockExecutor.mockCommand('cat "/secret" | base64 -w 0', {
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

      mockExecutor.mockCommand('mkdir -p "/test"', {
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      mockExecutor.mockCommand(`echo "${base64Content}" | base64 -d > "/test/output.txt"`, {
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      const bytesWritten = await polyfill.writeFile('/test/output.txt', content);
      expect(bytesWritten).toBe(content.length);

      const commands = mockExecutor.getExecutedCommands();
      expect(commands.some((c) => c.command.includes('mkdir -p'))).toBe(true);
      expect(commands.some((c) => c.command.includes('base64 -d'))).toBe(true);
    });

    it('should write text file directly', async () => {
      mockExecutor.mockCommand('mkdir -p "/test"', {
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      mockExecutor.mockCommand('cat > "/test/text.txt" << \'POLYFILL_EOF\'', {
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      const bytesWritten = await polyfill.writeTextFile('/test/text.txt', 'Hello World');
      expect(bytesWritten).toBe(11);
    });
  });

  describe('deleteFiles', () => {
    it('should delete multiple files', async () => {
      mockExecutor.mockCommand('rm -f "/file1.txt"', {
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      mockExecutor.mockCommand('rm -f "/file2.txt"', {
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
      mockExecutor.mockCommand('rm -f "/protected"', {
        stdout: '',
        stderr: 'rm: cannot remove',
        exitCode: 1
      });

      const results = await polyfill.deleteFiles(['/protected']);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toBeDefined();
    });
  });

  describe('createDirectories', () => {
    it('should create directories with mkdir -p', async () => {
      mockExecutor.mockCommand('mkdir -p "/new/dir"', {
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      await polyfill.createDirectories(['/new/dir']);

      const commands = mockExecutor.getExecutedCommands();
      expect(commands[0].command).toBe('mkdir -p "/new/dir"');
    });

    it('should set permissions when specified', async () => {
      mockExecutor.mockCommand('mkdir -p "/new/dir"', {
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      mockExecutor.mockCommand('chmod 755 "/new/dir"', {
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
        'ls -la "/test" --time-style=+"%Y-%m-%dT%H:%M:%S" 2>/dev/null || echo "DIRECTORY_NOT_FOUND"',
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
        'ls -la "/nonexistent" --time-style=+"%Y-%m-%dT%H:%M:%S" 2>/dev/null || echo "DIRECTORY_NOT_FOUND"',
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
        'stat -c \'%s|%Y|%W|%a|%U|%G|%F\' "/test/file.txt" 2>/dev/null || echo "STAT_FAILED"',
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
        'find "/home" -name \'*.txt\' -print 2>/dev/null || echo "FIND_FAILED"',
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
        'find "/home" -name \'*.log\' -print 2>/dev/null || echo "FIND_FAILED"',
        {
          stdout: 'FIND_FAILED',
          stderr: '',
          exitCode: 0
        }
      );

      mockExecutor.mockCommand('ls -R "/home" 2>/dev/null | grep -E "*.log" || true', {
        stdout: 'app.log\nerror.log',
        stderr: '',
        exitCode: 0
      });

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
