import type { ISandbox } from '@/interfaces';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

export interface SandboxContractOptions {
  getAdapter: () => ISandbox;
  /**
   * Some providers implement stop as termination instead of pause. They should
   * still recreate via ensureRunning(), but cannot directly start() after stop().
   */
  supportsStartAfterStop?: boolean;
}

export const describeSandboxContract = ({
  getAdapter,
  supportsStartAfterStop = true
}: SandboxContractOptions) => {
  const adapter = getAdapter();

  // ==================== Container Lifecycle Operations ====================
  describe.sequential('Container Lifecycle Operations', () => {
    describe('ensureRunning()', () => {
      it('should return immediately when sandbox is already running', async () => {
        // Sandbox is running from beforeAll
        await expect(adapter.ensureRunning()).resolves.toBeUndefined();
        expect(adapter.status.state).toBe('Running');
      });

      it('should start sandbox when it is stopped', async () => {
        // Stop the sandbox first
        await adapter.stop();
        expect(['Stopped', 'Stopping']).toContain(adapter.status.state);

        // ensureRunning should start it
        await adapter.ensureRunning();
        expect(adapter.status.state).toBe('Running');
      });

      it('should wait and verify sandbox is running', async () => {
        // Ensure sandbox is running
        await adapter.ensureRunning();

        // Verify it's actually running by executing a command
        const result = await adapter.execute('echo "test"');
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('test');
      });
    });

    describe('getInfo()', () => {
      it('should return sandbox info', async () => {
        const info = await adapter.getInfo();

        expect(info).not.toBeNull();
        expect(info?.id).toBe(adapter.id);
        expect(info?.status.state).toBe('Running');
      });
    });

    describe('ping()', () => {
      it('should return true when container is healthy', async () => {
        await adapter.ensureRunning();
        const result = await adapter.ping();

        expect(result).toBe(true);
      });
    });

    if (supportsStartAfterStop) {
      describe('stop() and start()', () => {
        it('should stop the container', async () => {
          await adapter.stop();

          expect(adapter.status.state).toBe('Stopped');
        });

        it('should start the container', async () => {
          await adapter.start();

          expect(adapter.status.state).toBe('Running');
        });
      });
    }

    describe('waitUntilReady()', () => {
      it('should resolve when container is ready', async () => {
        await expect(adapter.waitUntilReady(30000)).resolves.toBeUndefined();
      }, 35_000);
    });
  });

  // ==================== Command Operations ====================
  describe('Command Operations', () => {
    beforeAll(async () => {
      await adapter.ensureRunning();
    });
    describe('execute()', () => {
      it('should execute a simple command', async () => {
        const result = await adapter.execute('echo "Hello, World!"');

        expect(result.stdout.trim()).toBe('Hello, World!');
        expect(result.exitCode).toBe(0);
      });

      it('should execute command with working directory', async () => {
        const result = await adapter.execute('pwd', { workingDirectory: '/tmp' });

        expect(result.stdout.trim()).toContain('/tmp');
        expect(result.exitCode).toBe(0);
      });

      it('should capture stderr output', async () => {
        const result = await adapter.execute('echo "error" >&2');

        expect(result.stderr.trim()).toBe('error');
        expect(result.exitCode).toBe(0);
      });

      it('should return non-zero exit code on failure', async () => {
        const result = await adapter.execute('exit 1');

        expect(result.exitCode).toBe(1);
      });

      it('should handle complex shell commands', async () => {
        const result = await adapter.execute('echo "a b c" | wc -w');

        expect(result.stdout.trim()).toBe('3');
        expect(result.exitCode).toBe(0);
      });

      it('should handle environment variables', async () => {
        const result = await adapter.execute('echo $HOME');

        expect(result.stdout.trim()).not.toBe('');
        expect(result.exitCode).toBe(0);
      });
    });

    describe('executeStream()', () => {
      it('should stream stdout to handler', async () => {
        const chunks: string[] = [];

        await adapter.executeStream('echo "streamed"', {
          onStdout: (msg) => {
            chunks.push(msg.text);
          }
        });

        expect(chunks.join('')).toContain('streamed');
      });

      it('should stream stderr to handler', async () => {
        const chunks: string[] = [];

        await adapter.executeStream('echo "error" >&2', {
          onStderr: (msg) => {
            chunks.push(msg.text);
          }
        });

        expect(chunks.join('')).toContain('error');
      });

      it('should call onComplete with result', async () => {
        let exitCode: number | null | undefined;

        await adapter.executeStream('echo done', {
          onComplete: (result) => {
            exitCode = result.exitCode;
          }
        });

        expect(exitCode).toBe(0);
      });
    });
  });

  // ==================== File Operations ====================
  describe('File Operations', () => {
    const testDir = '/tmp/test-files';
    const testFile = `${testDir}/test.txt`;
    const testContent = 'Hello, FastGPT!';

    beforeAll(async () => {
      await adapter.ensureRunning();
      // Create test directory and clean up any existing test files
      await adapter.execute(`mkdir -p ${testDir}`);
      await adapter.execute(`rm -rf ${testDir}/test-*`);
    });

    afterAll(async () => {
      // Cleanup test directory
      try {
        await adapter.deleteDirectories([testDir], { recursive: true, force: true });
      } catch {
        // Ignore
      }
    });

    // ===== writeFiles Tests =====
    describe('writeFiles()', () => {
      it('should write single file with string content', async () => {
        const results = await adapter.writeFiles([{ path: testFile, data: testContent }]);

        expect(results).toHaveLength(1);
        expect(results[0].path).toBe(testFile);
        expect(results[0].error).toBeNull();
        expect(results[0].bytesWritten).toBeGreaterThan(0);

        // Verify file content
        const readResults = await adapter.readFiles([testFile]);
        const content = new TextDecoder().decode(readResults[0].content);
        expect(content.trim()).toBe(testContent);
      });

      it('should write multiple files in batch', async () => {
        const files = [
          { path: `${testDir}/test-multi1.txt`, data: 'Content 1' },
          { path: `${testDir}/test-multi2.txt`, data: 'Content 2' },
          { path: `${testDir}/test-multi3.txt`, data: 'Content 3' }
        ];

        const results = await adapter.writeFiles(files);

        expect(results).toHaveLength(3);
        results.forEach((result) => {
          expect(result.error).toBeNull();
          expect(result.bytesWritten).toBeGreaterThan(0);
        });

        // Verify all files were created
        const entries = await adapter.listDirectory(testDir);
        expect(entries.some((e) => e.name === 'test-multi1.txt')).toBe(true);
        expect(entries.some((e) => e.name === 'test-multi2.txt')).toBe(true);
        expect(entries.some((e) => e.name === 'test-multi3.txt')).toBe(true);
      });

      it('should overwrite existing file', async () => {
        const path = `${testDir}/test-overwrite.txt`;

        // First write
        await adapter.writeFiles([{ path, data: 'Original content' }]);

        // Second write (overwrite)
        await adapter.writeFiles([{ path, data: 'New content' }]);

        // Verify content was overwritten
        const results = await adapter.readFiles([path]);
        const content = new TextDecoder().decode(results[0].content);
        expect(content.trim()).toBe('New content');
        expect(content).not.toContain('Original');
      });

      it('should write UTF-8 encoded content', async () => {
        const utf8Content = '中文测试 Hello 🚀';
        const path = `${testDir}/test-utf8.txt`;

        const results = await adapter.writeFiles([{ path, data: utf8Content }]);

        expect(results[0].error).toBeNull();

        // Verify UTF-8 content
        const readResults = await adapter.readFiles([path]);
        const content = new TextDecoder().decode(readResults[0].content);
        expect(content.trim()).toBe(utf8Content);
      });

      it('should write binary content (Uint8Array)', async () => {
        const binaryData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
        const path = `${testDir}/test-binary.bin`;

        const results = await adapter.writeFiles([{ path, data: binaryData }]);

        expect(results[0].error).toBeNull();
        expect(results[0].bytesWritten).toBe(5);

        // Verify binary content
        const readResults = await adapter.readFiles([path]);
        const content = new TextDecoder().decode(readResults[0].content);
        expect(content.trim()).toBe('Hello');
      });

      it('should write large file content', async () => {
        const largeContent = 'x'.repeat(1024 * 100); // 100KB
        const path = `${testDir}/test-large.txt`;

        const results = await adapter.writeFiles([{ path, data: largeContent }]);

        expect(results[0].error).toBeNull();
        expect(results[0].bytesWritten).toBeGreaterThan(1024 * 100 * 0.9);
      });

      it('should write empty file', async () => {
        const path = `${testDir}/test-empty.txt`;

        const results = await adapter.writeFiles([{ path, data: '' }]);

        expect(results[0].error).toBeNull();

        // Verify file exists but is empty
        const readResults = await adapter.readFiles([path]);
        expect(readResults[0].content.length).toBeLessThanOrEqual(1); // May have newline
      });

      it('should handle special characters in content', async () => {
        const specialContent = 'Line1\nLine2\tTabbed\r\nWindows';
        const path = `${testDir}/test-special.txt`;

        const results = await adapter.writeFiles([{ path, data: specialContent }]);

        expect(results[0].error).toBeNull();

        // Verify special characters preserved
        const readResults = await adapter.readFiles([path]);
        const content = new TextDecoder().decode(readResults[0].content);
        expect(content).toContain('Line1');
        expect(content).toContain('Line2');
      });
    });

    // ===== readFiles Tests =====
    describe('readFiles()', () => {
      it('should read single file content', async () => {
        const content = 'Hello, Sandbox!';
        await adapter.writeFiles([{ path: `${testDir}/test-read.txt`, data: content }]);

        const results = await adapter.readFiles([`${testDir}/test-read.txt`]);

        expect(results).toHaveLength(1);
        expect(results[0].path).toBe(`${testDir}/test-read.txt`);
        expect(results[0].error).toBeNull();
        expect(results[0].content).toBeDefined();

        const text = new TextDecoder().decode(results[0].content);
        expect(text.trim()).toBe(content);
      });

      it('should read multiple files in batch', async () => {
        await adapter.writeFiles([
          { path: `${testDir}/test-batch1.txt`, data: 'file1' },
          { path: `${testDir}/test-batch2.txt`, data: 'file2' },
          { path: `${testDir}/test-batch3.txt`, data: 'file3' }
        ]);

        const results = await adapter.readFiles([
          `${testDir}/test-batch1.txt`,
          `${testDir}/test-batch2.txt`,
          `${testDir}/test-batch3.txt`
        ]);

        expect(results).toHaveLength(3);
        results.forEach((result, index) => {
          expect(result.error).toBeNull();
          const text = new TextDecoder().decode(result.content);
          expect(text.trim()).toBe(`file${index + 1}`);
        });
      });

      it('should handle UTF-8 encoded content', async () => {
        const utf8Content = '你好世界 Hello 🌍';
        await adapter.writeFiles([{ path: `${testDir}/test-utf8-read.txt`, data: utf8Content }]);

        const results = await adapter.readFiles([`${testDir}/test-utf8-read.txt`]);
        const text = new TextDecoder().decode(results[0].content);

        expect(text.trim()).toContain('你好世界');
        expect(text.trim()).toContain('Hello');
        expect(text.trim()).toContain('🌍');
      });

      it('should handle large file content', async () => {
        const largeContent = 'A'.repeat(1024 * 100); // 100KB
        await adapter.writeFiles([{ path: `${testDir}/test-large-read.txt`, data: largeContent }]);

        const results = await adapter.readFiles([`${testDir}/test-large-read.txt`]);

        expect(results[0].error).toBeNull();
        expect(results[0].content.length).toBeGreaterThan(1024 * 100 * 0.9);
      });

      it('should return error for non-existent file', async () => {
        const results = await adapter.readFiles([`${testDir}/non-existent.txt`]);

        expect(results).toHaveLength(1);
        expect(results[0].path).toBe(`${testDir}/non-existent.txt`);
        // Either error is set OR content is empty (implementation dependent)
        const hasError = results[0].error !== null;
        const isEmpty = results[0].content.length === 0;
        expect(hasError || isEmpty).toBe(true);
      });

      it('should handle mixed success and failure', async () => {
        await adapter.writeFiles([{ path: `${testDir}/test-exists.txt`, data: 'exists' }]);

        const results = await adapter.readFiles([
          `${testDir}/test-exists.txt`,
          `${testDir}/non-existent.txt`
        ]);

        expect(results).toHaveLength(2);
        expect(results[0].error).toBeNull();
        // Second file should have error or be empty
        const hasError = results[1].error !== null;
        const isEmpty = results[1].content.length === 0;
        expect(hasError || isEmpty).toBe(true);
      });

      it('should read empty file', async () => {
        await adapter.writeFiles([{ path: `${testDir}/test-empty-read.txt`, data: '' }]);

        const results = await adapter.readFiles([`${testDir}/test-empty-read.txt`]);

        expect(results[0].error).toBeNull();
        expect(results[0].content.length).toBeLessThanOrEqual(1); // May have newline
      });

      it('should handle special characters in content', async () => {
        const specialContent = 'Line1\nLine2\tTabbed\r\nWindows';
        await adapter.writeFiles([
          { path: `${testDir}/test-special-read.txt`, data: specialContent }
        ]);

        const results = await adapter.readFiles([`${testDir}/test-special-read.txt`]);
        const text = new TextDecoder().decode(results[0].content);

        expect(text).toContain('Line1');
        expect(text).toContain('Line2');
      });
    });

    // ===== listDirectory Tests =====
    describe('listDirectory()', () => {
      it('should list files and directories', async () => {
        // Create test files and directories
        await adapter.execute(`touch ${testDir}/test-list-file.txt`);
        await adapter.execute(`mkdir -p ${testDir}/test-list-subdir`);
        await adapter.execute(`touch ${testDir}/test-list-subdir/nested.txt`);

        const entries = await adapter.listDirectory(testDir);

        expect(entries).toBeDefined();
        expect(Array.isArray(entries)).toBe(true);
        expect(entries.length).toBeGreaterThan(0);

        // Verify file
        const file = entries.find((e) => e.name === 'test-list-file.txt');
        expect(file).toBeDefined();
        expect(file?.isFile).toBe(true);
        expect(file?.isDirectory).toBe(false);
        expect(file?.path).toBe(`${testDir}/test-list-file.txt`);

        // Verify directory
        const dir = entries.find((e) => e.name === 'test-list-subdir');
        expect(dir).toBeDefined();
        expect(dir?.isDirectory).toBe(true);
        expect(dir?.isFile).toBe(false);
        expect(dir?.path).toBe(`${testDir}/test-list-subdir`);
      });

      it('should list nested directory contents', async () => {
        await adapter.execute(`mkdir -p ${testDir}/test-nested/sub1/sub2`);
        await adapter.execute(`touch ${testDir}/test-nested/sub1/file1.txt`);
        await adapter.execute(`touch ${testDir}/test-nested/sub1/sub2/file2.txt`);

        const entries = await adapter.listDirectory(`${testDir}/test-nested/sub1`);

        expect(entries).toBeDefined();
        const file = entries.find((e) => e.name === 'file1.txt');
        const subdir = entries.find((e) => e.name === 'sub2');

        expect(file?.isFile).toBe(true);
        expect(subdir?.isDirectory).toBe(true);
      });

      it('should return empty array for empty directory', async () => {
        await adapter.execute(`mkdir -p ${testDir}/test-empty-dir`);

        const entries = await adapter.listDirectory(`${testDir}/test-empty-dir`);

        expect(entries).toBeDefined();
        expect(Array.isArray(entries)).toBe(true);
        expect(entries.length).toBe(0);
      });

      it('should handle non-existent directory', async () => {
        await expect(adapter.listDirectory(`${testDir}/non-existent-dir`)).rejects.toThrow();
      });

      it('should include file size information', async () => {
        await adapter.execute(`echo "test content" > ${testDir}/test-size.txt`);

        const entries = await adapter.listDirectory(testDir);
        const file = entries.find((e) => e.name === 'test-size.txt');

        expect(file).toBeDefined();
        expect(file?.size).toBeDefined();
        expect(file?.size).toBeGreaterThan(0);
      });
    });

    describe('getFileInfo()', () => {
      it('should get file info', async () => {
        const infoMap = await adapter.getFileInfo([testFile]);

        expect(infoMap.has(testFile)).toBe(true);
        const info = infoMap.get(testFile);
        expect(info?.size).toBeGreaterThan(0);
        expect(info?.isFile).toBe(true);
      });
    });

    describe('moveFiles()', () => {
      it('should move file', async () => {
        const source = `${testDir}/to-move.txt`;
        const dest = `${testDir}/moved.txt`;

        await adapter.writeFiles([{ path: source, data: 'move me' }]);
        await adapter.moveFiles([{ source, destination: dest }]);

        const results = await adapter.readFiles([dest]);
        expect(results[0].error).toBeNull();

        const content = new TextDecoder().decode(results[0].content);
        // Polyfill may add trailing newline
        expect(content.trim()).toBe('move me');
      });
    });

    describe('replaceContent()', () => {
      it('should replace content in file', async () => {
        const file = `${testDir}/replace.txt`;
        await adapter.writeFiles([{ path: file, data: 'Hello World' }]);

        await adapter.replaceContent([{ path: file, oldContent: 'World', newContent: 'FastGPT' }]);

        const results = await adapter.readFiles([file]);
        const content = new TextDecoder().decode(results[0].content);
        // Polyfill may add trailing newline
        expect(content.trim()).toBe('Hello FastGPT');
      });
    });

    describe('deleteFiles()', () => {
      it('should delete file', async () => {
        const file = `${testDir}/to-delete.txt`;
        await adapter.writeFiles([{ path: file, data: 'delete me' }]);

        const results = await adapter.deleteFiles([file]);

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(true);

        // Verify file is deleted by checking content is empty or error is set
        const readResults = await adapter.readFiles([file]);
        const hasError = readResults[0].error !== null;
        const isEmpty = readResults[0].content.length === 0;
        expect(hasError || isEmpty).toBe(true);
      });
    });

    describe('createDirectories()', () => {
      it('should create nested directories', async () => {
        const nestedDir = `${testDir}/nested/deep/dir`;
        await adapter.createDirectories([nestedDir]);

        // Verify by writing a file
        await adapter.writeFiles([{ path: `${nestedDir}/file.txt`, data: 'test' }]);
        const results = await adapter.readFiles([`${nestedDir}/file.txt`]);
        expect(results[0].error).toBeNull();
      });
    });

    describe('deleteDirectories()', () => {
      it('should delete directory recursively', async () => {
        const dir = `${testDir}/to-delete-dir`;
        await adapter.createDirectories([dir]);
        await adapter.writeFiles([{ path: `${dir}/file.txt`, data: 'test' }]);

        await adapter.deleteDirectories([dir], { recursive: true });

        // Verify directory is deleted
        const entries = await adapter.listDirectory(testDir);
        expect(entries.some((e) => e.name === 'to-delete-dir')).toBe(false);
      });
    });

    describe('search()', () => {
      it('should search for files by pattern', async () => {
        const results = await adapter.search('*.txt', testDir);

        expect(results.length).toBeGreaterThan(0);
        expect(results.some((r) => r.path.endsWith('.txt'))).toBe(true);
      });
    });

    describe('getMetrics()', () => {
      it('should get sandbox metrics', async () => {
        const metrics = await adapter.getMetrics();

        expect(metrics.cpuCount).toBeGreaterThan(0);
        expect(metrics.memoryTotalMiB).toBeGreaterThan(0);
        expect(metrics.timestamp).toBeGreaterThan(0);
      });
    });

    // ===== Integrated Scenarios =====
    describe('Integrated Scenarios', () => {
      it('should support complete file lifecycle: create -> read -> modify -> read', async () => {
        const path = `${testDir}/test-lifecycle.txt`;

        // 1. Create file
        await adapter.writeFiles([{ path, data: 'Initial content' }]);

        // 2. Read file
        let results = await adapter.readFiles([path]);
        let text = new TextDecoder().decode(results[0].content);
        expect(text.trim()).toBe('Initial content');

        // 3. Modify file
        await adapter.writeFiles([{ path, data: 'Modified content' }]);

        // 4. Read again
        results = await adapter.readFiles([path]);
        text = new TextDecoder().decode(results[0].content);
        expect(text.trim()).toBe('Modified content');
      });

      it('should support directory tree operations', async () => {
        // Create directory structure
        await adapter.execute(`mkdir -p ${testDir}/test-tree/dir1/subdir1`);
        await adapter.execute(`mkdir -p ${testDir}/test-tree/dir2`);

        // Write files
        await adapter.writeFiles([
          { path: `${testDir}/test-tree/root.txt`, data: 'Root file' },
          { path: `${testDir}/test-tree/dir1/file1.txt`, data: 'File 1' },
          { path: `${testDir}/test-tree/dir1/subdir1/file2.txt`, data: 'File 2' },
          { path: `${testDir}/test-tree/dir2/file3.txt`, data: 'File 3' }
        ]);

        // List root directory
        const rootEntries = await adapter.listDirectory(`${testDir}/test-tree`);
        expect(rootEntries.find((e) => e.name === 'root.txt')).toBeDefined();
        expect(rootEntries.find((e) => e.name === 'dir1')).toBeDefined();
        expect(rootEntries.find((e) => e.name === 'dir2')).toBeDefined();

        // List subdirectory
        const dir1Entries = await adapter.listDirectory(`${testDir}/test-tree/dir1`);
        expect(dir1Entries.find((e) => e.name === 'file1.txt')).toBeDefined();
        expect(dir1Entries.find((e) => e.name === 'subdir1')).toBeDefined();

        // Read all files
        const readResults = await adapter.readFiles([
          `${testDir}/test-tree/root.txt`,
          `${testDir}/test-tree/dir1/file1.txt`,
          `${testDir}/test-tree/dir1/subdir1/file2.txt`,
          `${testDir}/test-tree/dir2/file3.txt`
        ]);

        expect(readResults.every((r) => r.error === null)).toBe(true);
      });

      it('should handle concurrent file operations', async () => {
        const operations = Array.from({ length: 5 }, (_, i) => ({
          path: `${testDir}/test-concurrent-${i}.txt`,
          data: `Content ${i}`
        }));

        // Concurrent writes
        await Promise.all(operations.map((op) => adapter.writeFiles([op])));

        // Concurrent reads
        const paths = operations.map((op) => op.path);
        const results = await adapter.readFiles(paths);

        expect(results.length).toBe(5);
        results.forEach((result, i) => {
          expect(result.error).toBeNull();
          const text = new TextDecoder().decode(result.content);
          expect(text.trim()).toBe(`Content ${i}`);
        });
      });

      it('should maintain file integrity across operations', async () => {
        const path = `${testDir}/test-integrity.txt`;
        const content = 'A'.repeat(10000); // 10KB

        // Write large file
        await adapter.writeFiles([{ path, data: content }]);

        // Multiple reads to verify consistency
        for (let i = 0; i < 3; i++) {
          const results = await adapter.readFiles([path]);
          const text = new TextDecoder().decode(results[0].content);
          expect(text.trim()).toBe(content);
          expect(text.trim().length).toBe(10000);
        }
      });
    });

    // ===== Error Handling =====
    describe('Error Handling', () => {
      it('should handle invalid file paths', async () => {
        const results = await adapter.readFiles(['']);
        // Either error is set OR content is empty
        const hasError = results[0].error !== null;
        const isEmpty = results[0].content.length === 0;
        expect(hasError || isEmpty).toBe(true);
      });

      it('should handle mixed batch operations with errors', async () => {
        await adapter.execute(`mkdir -p ${testDir}/test-mixed`);
        await adapter.execute(`touch ${testDir}/test-mixed/exists.txt`);

        const results = await adapter.writeFiles([
          { path: `${testDir}/test-mixed/new1.txt`, data: 'New 1' },
          { path: `${testDir}/test-mixed/exists.txt`, data: 'Overwrite' },
          { path: `${testDir}/test-mixed/new2.txt`, data: 'New 2' }
        ]);

        // All should succeed (overwrite is allowed)
        expect(results.every((r) => r.error === null)).toBe(true);
      });
    });
  });
};
