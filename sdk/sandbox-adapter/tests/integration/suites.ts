import type { ISandbox } from '@/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Shared live-provider contract focused on behavior promised by the public adapter API. */
export const describeSandboxContract = (getAdapter: () => ISandbox): void => {
  const adapter = getAdapter();
  const testDir = `/tmp/sandbox-adapter-${crypto.randomUUID()}`;

  describe.sequential('sandbox contract', () => {
    beforeAll(async () => {
      await adapter.ensureRunning();
      await adapter.createDirectories([testDir]);
    });

    afterAll(async () => {
      await adapter.deleteDirectories([testDir]).catch(() => {});
    });

    describe('lifecycle', () => {
      it('keeps an ensured resource healthy and addressable', async () => {
        await adapter.ensureRunning();
        await adapter.ensureRunning();
        const info = await adapter.getInfo();

        expect(info?.id).toBe(adapter.id);
        expect(info?.status.state).toBe('Running');
        await expect(adapter.ping()).resolves.toBe(true);
      });
    });

    describe('commands', () => {
      it('returns stdout, stderr, and non-zero exit codes', async () => {
        const stdout = await adapter.execute('printf output');
        const stderr = await adapter.execute('printf error >&2');
        const failed = await adapter.execute('exit 7');

        expect(stdout).toMatchObject({ stdout: 'output', exitCode: 0 });
        expect(stderr).toMatchObject({ stderr: 'error', exitCode: 0 });
        expect(failed.exitCode).toBe(7);
      });

      it('supports working directory and environment options', async () => {
        const result = await adapter.execute('printf "$VALUE:%s" "$PWD"', {
          workingDirectory: testDir,
          env: { VALUE: 'configured' }
        });

        expect(result.stdout).toBe(`configured:${testDir}`);
      });

      it.runIf(adapter.capabilities.command.streaming)('streams output in real time', async () => {
        const chunks: string[] = [];
        await adapter.executeStream('printf streamed', {
          onStdout: (message) => {
            chunks.push(message.text);
          }
        });
        expect(chunks.join('')).toContain('streamed');
      });
    });

    describe('filesystem', () => {
      const textPath = `${testDir}/file.txt`;
      const streamPath = `${testDir}/stream.bin`;

      it('round-trips ordered writes and byte ranges', async () => {
        const written = await adapter.writeFiles([
          { path: textPath, data: 'first' },
          { path: textPath, data: 'second' }
        ]);
        const [fullRead] = await adapter.readFiles([textPath]);

        expect(written.every((result) => result.error === null)).toBe(true);
        expect(new TextDecoder().decode(fullRead.content)).toBe('second');

        await adapter.writeFiles([{ path: textPath, data: '0123456789' }]);
        const [rangeRead] = await adapter.readFiles([textPath], { offset: 2, length: 4 });

        expect(rangeRead.error).toBeNull();
        expect(new TextDecoder().decode(rangeRead.content)).toBe('2345');
      });

      it('supports native or polyfilled file streams', async () => {
        const input = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]));
            controller.enqueue(new Uint8Array([3, 4]));
            controller.close();
          }
        });
        await adapter.writeFileStream(streamPath, input);

        const output: number[] = [];
        for await (const chunk of adapter.readFileStream(streamPath)) output.push(...chunk);
        expect(output).toEqual([1, 2, 3, 4]);
      });

      it('lists, moves, searches, and deletes files', async () => {
        const movedPath = `${testDir}/moved.txt`;
        await adapter.writeFiles([{ path: textPath, data: 'content' }]);
        await adapter.moveFiles([{ source: textPath, destination: movedPath }]);

        const entries = await adapter.listDirectory(testDir);
        const search = await adapter.search('moved.txt', testDir);
        const [deleted] = await adapter.deleteFiles([movedPath]);

        expect(
          entries.some((entry) => entry.path === movedPath || entry.name === 'moved.txt')
        ).toBe(true);
        expect(search.some((entry) => entry.path === movedPath)).toBe(true);
        expect(deleted.success).toBe(true);
      });

      it('round-trips POSIX permission modes', async () => {
        await adapter.writeFiles([{ path: textPath, data: 'mode', mode: 0o640 }]);
        await adapter.setPermissions([{ path: textPath, mode: 0o600 }]);
        const info = await adapter.getFileInfo([textPath]);

        expect(info.get(textPath)?.mode).toBe(0o600);
      });
    });
  });
};
