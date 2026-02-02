import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MinimalProviderConnection } from '../../src/adapters/MinimalProviderAdapter';
import { MinimalProviderAdapter } from '../../src/adapters/MinimalProviderAdapter';
import { MockSandboxAdapter } from '../mocks/MockSandboxAdapter';

/**
 * Integration tests for filesystem operations.
 *
 * These tests cover the IFileSystem interface implementations:
 * - File operations (read, write, delete, move, replace)
 * - Streaming operations (read/write streams)
 * - Directory operations (create, delete, list)
 * - Metadata operations (get info, set permissions)
 * - Search operations
 *
 * Tests are run against both native (MockSandboxAdapter) and polyfilled
 * (MinimalProviderAdapter) implementations to ensure feature parity.
 */
describe('Filesystem Operations', () => {
  describe('Native Filesystem (MockSandboxAdapter)', () => {
    let adapter: MockSandboxAdapter;

    beforeEach(() => {
      adapter = new MockSandboxAdapter();
    });

    afterEach(async () => {
      await adapter.close();
    });

    describe('File Operations', () => {
      it('should write and read single file', async () => {
        const content = 'Hello, World!';
        const writeResult = await adapter.writeFiles([{ path: '/test.txt', data: content }]);

        expect(writeResult[0].error).toBeNull();
        expect(writeResult[0].bytesWritten).toBe(content.length);

        const readResult = await adapter.readFiles(['/test.txt']);
        expect(readResult[0].error).toBeNull();
        expect(new TextDecoder().decode(readResult[0].content)).toBe(content);
      });

      it('should write and read multiple files', async () => {
        const files = [
          { path: '/file1.txt', data: 'Content 1' },
          { path: '/file2.txt', data: 'Content 2' },
          { path: '/file3.txt', data: 'Content 3' }
        ];

        const writeResults = await adapter.writeFiles(files);
        expect(writeResults.every((r) => r.error === null)).toBe(true);

        const readResults = await adapter.readFiles(files.map((f) => f.path));
        expect(readResults.every((r) => r.error === null)).toBe(true);
        expect(readResults.map((r) => new TextDecoder().decode(r.content))).toEqual(
          files.map((f) => f.data)
        );
      });

      it('should handle Uint8Array data', async () => {
        const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"

        const writeResult = await adapter.writeFiles([{ path: '/binary.bin', data }]);
        expect(writeResult[0].bytesWritten).toBe(5);

        const readResult = await adapter.readFiles(['/binary.bin']);
        expect(readResult[0].content).toEqual(data);
      });

      it('should handle ArrayBuffer data', async () => {
        const buffer = new ArrayBuffer(4);
        new Uint8Array(buffer).set([1, 2, 3, 4]);

        const writeResult = await adapter.writeFiles([{ path: '/buffer.bin', data: buffer }]);
        expect(writeResult[0].bytesWritten).toBe(4);

        const readResult = await adapter.readFiles(['/buffer.bin']);
        expect(readResult[0].content).toEqual(new Uint8Array([1, 2, 3, 4]));
      });

      it('should delete files', async () => {
        await adapter.writeFiles([
          { path: '/delete1.txt', data: 'content1' },
          { path: '/delete2.txt', data: 'content2' }
        ]);

        const deleteResults = await adapter.deleteFiles(['/delete1.txt', '/delete2.txt']);
        expect(deleteResults.every((r) => r.success)).toBe(true);

        // Verify deletion
        const readResults = await adapter.readFiles(['/delete1.txt']);
        expect(readResults[0].error).toBeDefined();
      });

      it('should move files', async () => {
        await adapter.writeFiles([{ path: '/source.txt', data: 'movable content' }]);

        await adapter.moveFiles([{ source: '/source.txt', destination: '/dest.txt' }]);

        // Old path should not exist
        const oldRead = await adapter.readFiles(['/source.txt']);
        expect(oldRead[0].error).toBeDefined();

        // New path should exist
        const newRead = await adapter.readFiles(['/dest.txt']);
        expect(newRead[0].error).toBeNull();
        expect(new TextDecoder().decode(newRead[0].content)).toBe('movable content');
      });

      it('should replace content in files', async () => {
        await adapter.writeFiles([{ path: '/replace.txt', data: 'Hello, World! Hello!' }]);

        await adapter.replaceContent([
          { path: '/replace.txt', oldContent: 'Hello', newContent: 'Hi' }
        ]);

        const readResult = await adapter.readFiles(['/replace.txt']);
        const content = new TextDecoder().decode(readResult[0].content);
        expect(content).toBe('Hi, World! Hi!');
      });

      it('should handle read errors for non-existent files', async () => {
        const readResults = await adapter.readFiles(['/non-existent.txt']);

        expect(readResults[0].error).toBeDefined();
        expect(readResults[0].content.length).toBe(0);
      });

      it('should handle file paths with special characters', async () => {
        const paths = [
          '/path with spaces/file.txt',
          '/path-with-dashes/file.txt',
          '/path_with_underscores/file.txt',
          '/nested/deeply/file.txt'
        ];

        for (const path of paths) {
          await adapter.writeFiles([{ path, data: `content for ${path}` }]);
          const readResult = await adapter.readFiles([path]);
          expect(readResult[0].error).toBeNull();
        }
      });
    });

    describe('Directory Operations', () => {
      it('should create directories', async () => {
        await adapter.createDirectories(['/dir1', '/dir2', '/nested/dir3']);

        // Should be able to write to nested directory
        await adapter.writeFiles([{ path: '/nested/dir3/file.txt', data: 'nested content' }]);
        const readResult = await adapter.readFiles(['/nested/dir3/file.txt']);
        expect(readResult[0].error).toBeNull();
      });

      it('should list directory contents', async () => {
        await adapter.writeFiles([
          { path: '/listdir/file1.txt', data: '1' },
          { path: '/listdir/file2.txt', data: '2' },
          { path: '/listdir/subdir/file3.txt', data: '3' }
        ]);

        const entries = await adapter.listDirectory('/listdir');
        expect(entries.length).toBeGreaterThan(0);

        const names = entries.map((e) => e.name);
        expect(names).toContain('file1.txt');
        expect(names).toContain('file2.txt');
      });

      it('should delete directories', async () => {
        await adapter.writeFiles([{ path: '/deldir/file.txt', data: 'to be deleted' }]);

        await adapter.deleteDirectories(['/deldir'], { recursive: true });

        // Directory contents should be gone
        const readResult = await adapter.readFiles(['/deldir/file.txt']);
        expect(readResult[0].error).toBeDefined();
      });

      it('should delete directories recursively', async () => {
        await adapter.writeFiles([
          { path: '/recursive/nested/deep/file.txt', data: 'deep content' }
        ]);

        await adapter.deleteDirectories(['/recursive'], { recursive: true });

        const readResult = await adapter.readFiles(['/recursive/nested/deep/file.txt']);
        expect(readResult[0].error).toBeDefined();
      });
    });

    describe('File Metadata Operations', () => {
      it('should get file info', async () => {
        const content = 'test content for info';
        await adapter.writeFiles([{ path: '/info.txt', data: content }]);

        const info = await adapter.getFileInfo(['/info.txt']);
        const fileInfo = info.get('/info.txt');

        expect(fileInfo).toBeDefined();
        expect(fileInfo?.isFile).toBe(true);
        expect(fileInfo?.size).toBe(content.length);
      });

      it('should set file permissions', async () => {
        await adapter.writeFiles([{ path: '/perms.txt', data: 'content' }]);

        // Should not throw
        await adapter.setPermissions([{ path: '/perms.txt', mode: 0o755 }]);
      });
    });

    describe('Streaming Operations', () => {
      it('should read file as stream', async () => {
        const content = 'streaming content here';
        await adapter.writeFiles([{ path: '/stream.txt', data: content }]);

        const stream = await adapter.readFileStream('/stream.txt');
        const chunks: Uint8Array[] = [];

        for await (const chunk of stream) {
          chunks.push(chunk);
        }

        const combined = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }

        expect(new TextDecoder().decode(combined)).toBe(content);
      });

      it('should write file from stream', async () => {
        const content = new Uint8Array([0x48, 0x69, 0x21]); // "Hi!"
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(content);
            controller.close();
          }
        });

        await adapter.writeFileStream('/from-stream.bin', stream);

        const readResult = await adapter.readFiles(['/from-stream.bin']);
        expect(readResult[0].content).toEqual(content);
      });
    });

    describe('Search Operations', () => {
      it('should search for files by pattern', async () => {
        await adapter.writeFiles([
          { path: '/search/test.txt', data: '1' },
          { path: '/search/test.js', data: '2' },
          { path: '/search/other.txt', data: '3' }
        ]);

        const results = await adapter.search('*.txt', '/search');
        expect(results.length).toBeGreaterThan(0);

        const txtFiles = results.filter((r) => r.path.endsWith('.txt'));
        expect(txtFiles.length).toBeGreaterThan(0);
      });

      it('should search recursively', async () => {
        await adapter.writeFiles([
          { path: '/deep/file1.txt', data: '1' },
          { path: '/deep/nested/file2.txt', data: '2' }
        ]);

        const results = await adapter.search('*.txt');
        expect(results.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Polyfilled Filesystem (MinimalProviderAdapter)', () => {
    function createMockConnection(mockFs: Map<string, string>): MinimalProviderConnection {
      return {
        id: 'fs-test-sandbox',

        async execute(command: string) {
          // Ping
          if (command.includes('echo "PING"')) {
            return { stdout: 'PING', stderr: '', exitCode: 0 };
          }

          // Mkdir
          if (command.startsWith('mkdir -p')) {
            return { stdout: '', stderr: '', exitCode: 0 };
          }

          // Heredoc write
          if (command.includes("<< 'POLYFILL_EOF'")) {
            const pathMatch = command.match(/cat > "(.+?)" << 'POLYFILL_EOF'/);
            if (pathMatch) {
              const path = pathMatch[1];
              const lines = command.split('\n');
              const contentLines: string[] = [];
              let inContent = false;
              for (const line of lines) {
                if (line.includes("<< 'POLYFILL_EOF'")) {
                  inContent = true;
                  continue;
                }
                if (line.trim() === 'POLYFILL_EOF') {
                  break;
                }
                if (inContent) {
                  contentLines.push(line);
                }
              }
              mockFs.set(path, contentLines.join('\n'));
            }
            return { stdout: '', stderr: '', exitCode: 0 };
          }

          // Base64 write
          if (command.includes('base64 -d')) {
            const pathMatch = command.match(/> "(.+?)"$/);
            const dataMatch = command.match(/echo "(.+?)" \| base64 -d/);
            if (pathMatch && dataMatch) {
              const path = pathMatch[1]?.replace(/\\"/g, '"');
              const base64Data = dataMatch[1] || '';
              try {
                const decoded = atob(base64Data);
                mockFs.set(path, decoded);
              } catch {
                // Invalid base64
              }
            }
            return { stdout: '', stderr: '', exitCode: 0 };
          }

          // Base64 read
          if (command.includes('base64 -w 0')) {
            const match = command.match(/cat "(.+?)" \| base64 -w 0/);
            const path = match?.[1]?.replace(/\\"/g, '"');
            if (path && mockFs.has(path)) {
              const content = mockFs.get(path) || '';
              const binary = Array.from(content)
                .map((b) => String.fromCharCode(b.charCodeAt(0)))
                .join('');
              return { stdout: btoa(binary), stderr: '', exitCode: 0 };
            }
            return { stdout: '', stderr: 'cat: No such file', exitCode: 1 };
          }

          // List directory
          if (command.includes('ls -la')) {
            const match = command.match(/ls -la "?([^"]+)"?/);
            const path = match?.[1] || '.';

            const entries = Array.from(mockFs.keys())
              .filter((f) => f.startsWith(path))
              .map((f) => f.slice(path.length + 1).split('/')[0])
              .filter((f) => f);

            const uniqueEntries = [...new Set(entries)];
            const output = uniqueEntries
              .map((e) => `-rw-r--r-- 1 root root 100 2024-01-15T10:00:00 ${e}`)
              .join('\n');

            return { stdout: output, stderr: '', exitCode: 0 };
          }

          // Delete file (rm)
          if (command.startsWith('rm -f')) {
            const match = command.match(/rm -f "(.+?)"/);
            if (match) {
              const path = match[1];
              mockFs.delete(path);
            }
            return { stdout: '', stderr: '', exitCode: 0 };
          }

          // Move file (mv)
          if (command.startsWith('mv')) {
            const match = command.match(/mv "(.+?)" "(.+?)"/);
            if (match) {
              const source = match[1];
              const dest = match[2];
              if (mockFs.has(source)) {
                const content = mockFs.get(source);
                if (content !== undefined) {
                  mockFs.set(dest, content);
                  mockFs.delete(source);
                }
              }
            }
            return { stdout: '', stderr: '', exitCode: 0 };
          }

          return { stdout: '', stderr: '', exitCode: 0 };
        },

        async getStatus() {
          return { state: 'Running' as const };
        },

        async close() {
          // No-op
        }
      };
    }

    it('should write and read files via polyfill', async () => {
      const mockFs = new Map<string, string>();
      const connection = createMockConnection(mockFs);
      const adapter = new MinimalProviderAdapter();

      await adapter.connect(connection);

      try {
        const content = 'polyfilled content';
        const writeResult = await adapter.writeFiles([{ path: '/poly.txt', data: content }]);
        expect(writeResult[0].error).toBeNull();

        const readResult = await adapter.readFiles(['/poly.txt']);
        expect(readResult[0].error).toBeNull();
        expect(new TextDecoder().decode(readResult[0].content)).toBe(content);
      } finally {
        await adapter.close();
      }
    });

    it('should list directories via polyfill', async () => {
      const mockFs = new Map<string, string>();
      mockFs.set('/workspace/file1.txt', 'content1');
      mockFs.set('/workspace/file2.txt', 'content2');

      const connection = createMockConnection(mockFs);
      const adapter = new MinimalProviderAdapter();

      await adapter.connect(connection);

      try {
        const entries = await adapter.listDirectory('/workspace');
        expect(entries.length).toBe(2);
        expect(entries.map((e) => e.name).sort()).toEqual(['file1.txt', 'file2.txt']);
      } finally {
        await adapter.close();
      }
    });

    it('should delete files via polyfill', async () => {
      const mockFs = new Map<string, string>();
      mockFs.set('/delete.txt', 'to delete');

      const connection = createMockConnection(mockFs);
      const adapter = new MinimalProviderAdapter();

      await adapter.connect(connection);

      try {
        expect(mockFs.has('/delete.txt')).toBe(true);
        await adapter.deleteFiles(['/delete.txt']);
        expect(mockFs.has('/delete.txt')).toBe(false);
      } finally {
        await adapter.close();
      }
    });

    it('should move files via polyfill', async () => {
      const mockFs = new Map<string, string>();
      mockFs.set('/source.txt', 'movable');

      const connection = createMockConnection(mockFs);
      const adapter = new MinimalProviderAdapter();

      await adapter.connect(connection);

      try {
        await adapter.moveFiles([{ source: '/source.txt', destination: '/dest.txt' }]);
        expect(mockFs.has('/source.txt')).toBe(false);
        expect(mockFs.has('/dest.txt')).toBe(true);
        expect(mockFs.get('/dest.txt')).toBe('movable');
      } finally {
        await adapter.close();
      }
    });

    it('should create directories via polyfill', async () => {
      const mockFs = new Map<string, string>();
      const connection = createMockConnection(mockFs);
      const adapter = new MinimalProviderAdapter();

      await adapter.connect(connection);

      try {
        // Should not throw
        await adapter.createDirectories(['/newdir', '/another/dir']);
      } finally {
        await adapter.close();
      }
    });
  });

  describe('Cross-Provider File Operation Parity', () => {
    it('should produce equivalent results for same operations', async () => {
      // Native filesystem adapter
      const nativeAdapter = new MockSandboxAdapter();

      // Polyfilled filesystem adapter
      const mockFs = new Map<string, string>();
      const polyConnection: MinimalProviderConnection = {
        id: 'parity-test',
        async execute(command: string) {
          if (command.includes('echo "PING"')) {
            return { stdout: 'PING', stderr: '', exitCode: 0 };
          }
          if (command.startsWith('mkdir -p')) {
            return { stdout: '', stderr: '', exitCode: 0 };
          }
          if (command.includes("<< 'POLYFILL_EOF'")) {
            const pathMatch = command.match(/cat > "(.+?)" << 'POLYFILL_EOF'/);
            if (pathMatch) {
              const path = pathMatch[1];
              const lines = command.split('\n');
              const contentLines: string[] = [];
              let inContent = false;
              for (const line of lines) {
                if (line.includes("<< 'POLYFILL_EOF'")) {
                  inContent = true;
                  continue;
                }
                if (line.trim() === 'POLYFILL_EOF') {
                  break;
                }
                if (inContent) {
                  contentLines.push(line);
                }
              }
              mockFs.set(path, contentLines.join('\n'));
            }
            return { stdout: '', stderr: '', exitCode: 0 };
          }
          if (command.includes('base64 -w 0')) {
            const match = command.match(/cat "(.+?)" \| base64 -w 0/);
            const path = match?.[1]?.replace(/\\"/g, '"');
            if (path && mockFs.has(path)) {
              const content = mockFs.get(path) || '';
              const binary = Array.from(content)
                .map((b) => String.fromCharCode(b.charCodeAt(0)))
                .join('');
              return { stdout: btoa(binary), stderr: '', exitCode: 0 };
            }
            return { stdout: '', stderr: 'No such file', exitCode: 1 };
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        },
        async getStatus() {
          return { state: 'Running' as const };
        },
        async close() {}
      };

      const polyAdapter = new MinimalProviderAdapter();
      await polyAdapter.connect(polyConnection);

      // Perform same operations on both
      const testData = 'parity test data';
      const testPath = '/parity.txt';

      // Write
      await nativeAdapter.writeFiles([{ path: testPath, data: testData }]);
      await polyAdapter.writeFiles([{ path: testPath, data: testData }]);

      // Read
      const nativeRead = await nativeAdapter.readFiles([testPath]);
      const polyRead = await polyAdapter.readFiles([testPath]);

      // Results should be equivalent
      expect(nativeRead[0].error).toBeNull();
      expect(polyRead[0].error).toBeNull();
      expect(new TextDecoder().decode(nativeRead[0].content)).toBe(
        new TextDecoder().decode(polyRead[0].content)
      );

      // Cleanup
      await nativeAdapter.close();
      await polyAdapter.close();
    });
  });
});
