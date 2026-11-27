import { describe, expect, it, vi } from 'vitest';
import { sandboxReadFileTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/readFile.tool';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const sliceLines = (
  content: string | Uint8Array,
  options?: { offset?: number; limit?: number }
): Uint8Array => {
  const start = (options?.offset ?? 1) - 1;
  if (content instanceof Uint8Array) {
    return start === 0 ? content : Buffer.alloc(0);
  }
  if (!content) return Buffer.alloc(0);
  const lines = content.split('\n');
  const slice =
    options?.limit === undefined ? lines.slice(start) : lines.slice(start, start + options.limit);
  return slice.length > 0 ? Buffer.from(slice.join('\n'), 'utf8') : Buffer.alloc(0);
};

const createSandboxInstance = (
  content: string | Uint8Array,
  { chunkSize }: { chunkSize?: number } = {}
) =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    resolveRuntimePath: vi.fn((path: string) =>
      path.startsWith('/') ? path : `/workspace/sessions/chat_1/${path}`
    ),
    opensandbox: {
      readFileStream: vi.fn((_path: string, options?: { offset?: number; limit?: number }) => {
        const sliced = sliceLines(content, options);
        return (async function* () {
          if (!chunkSize) {
            if (sliced.byteLength > 0) yield sliced;
            return;
          }
          for (let i = 0; i < sliced.byteLength; i += chunkSize) {
            yield sliced.subarray(i, i + chunkSize);
          }
        })();
      })
    }
  }) as any;

const executeRead = (
  sandboxInstance: any,
  params: { path: string; offset?: number; limit?: number }
) =>
  sandboxReadFileTool.execute({
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'app_1',
    userId: 'user_1',
    chatId: 'chat_1',
    sandboxInstance,
    params
  });

describe('sandboxReadFileTool', () => {
  it('reads a whole file with 1-based line numbers and multi-chunk UTF-8 decoding', async () => {
    const sandboxInstance = createSandboxInstance('line 1\n你好世界', { chunkSize: 3 });

    const result = await executeRead(sandboxInstance, { path: 'notes.txt' });

    expect(result.response).toBe('1→line 1\n2→你好世界');
    expect(sandboxInstance.ensureAvailable).not.toHaveBeenCalled();
    expect(sandboxInstance.opensandbox.readFileStream).toHaveBeenCalledWith(
      '/workspace/sessions/chat_1/notes.txt',
      { offset: 1, limit: 2001 }
    );
  });

  it('reads absolute files outside workspace for builtin skills', async () => {
    const sandboxInstance = createSandboxInstance('# Skill Creator');
    const path = '/root/.fastgpt/skills/skill-creator/SKILL.md';

    const result = await executeRead(sandboxInstance, { path });

    expect(result.response).toBe('1→# Skill Creator');
    expect(sandboxInstance.resolveRuntimePath).toHaveBeenCalledWith(path, {
      allowAbsolutePath: true,
      allowOutsideWorkspace: true
    });
    expect(sandboxInstance.opensandbox.readFileStream).toHaveBeenCalledWith(path, {
      offset: 1,
      limit: 2001
    });
  });

  it('reads a line range via offset/limit and omits hint at exact EOF', async () => {
    const sandboxInstance = createSandboxInstance('line 1\nline 2\nline 3\nline 4');

    const middle = await executeRead(sandboxInstance, { path: 'notes.txt', offset: 2, limit: 2 });
    const tail = await executeRead(sandboxInstance, { path: 'notes.txt', offset: 3, limit: 2 });

    expect(sandboxInstance.opensandbox.readFileStream).toHaveBeenNthCalledWith(
      1,
      '/workspace/sessions/chat_1/notes.txt',
      { offset: 2, limit: 3 }
    );
    expect(middle.response).toBe(
      '2→line 2\n3→line 3\n\n[Showing lines 2-3. Use offset=4 to continue.]'
    );
    expect(tail.response).toBe('3→line 3\n4→line 4');
  });

  it('truncates a long file at max line limit and returns the next offset', async () => {
    const sandboxInstance = createSandboxInstance(
      Array.from({ length: 2005 }, (_, index) => `line ${index + 1}`).join('\n')
    );

    const result = await executeRead(sandboxInstance, { path: 'large.txt' });

    expect(result.response).toContain('1→line 1\n2→line 2');
    expect(result.response).toContain('2000→line 2000');
    expect(result.response).not.toContain('2001→line 2001');
    expect(result.response).toContain('[Showing lines 1-2000. Use offset=2001 to continue.]');
  });

  it('returns an empty-file notice for 0-byte or BOM-only files while preserving whitespace lines', async () => {
    const zeroByte = await executeRead(createSandboxInstance(Buffer.alloc(0)), {
      path: 'empty.txt'
    });
    const bomOnly = await executeRead(createSandboxInstance(new Uint8Array([0xef, 0xbb, 0xbf])), {
      path: 'bom.txt'
    });
    const whitespace = await executeRead(createSandboxInstance('  \n\n\t'), {
      path: 'whitespace.txt'
    });

    expect(zeroByte.response).toBe('[File exists but is empty: empty.txt]');
    expect(bomOnly.response).toBe('[File exists but is empty: bom.txt]');
    expect(whitespace.response).toBe('1→  \n2→\n3→\t');
  });

  it('strips file BOM only at offset 1 and preserves U+FEFF on paginated lines', async () => {
    const sandboxInstance = createSandboxInstance('\uFEFFline 1\n\uFEFFline 2');

    const full = await executeRead(sandboxInstance, { path: 'bom-lines.txt' });
    const paginated = await executeRead(sandboxInstance, { path: 'bom-lines.txt', offset: 2 });

    expect(full.response).toBe('1→line 1\n2→\uFEFFline 2');
    expect(paginated.response).toBe('2→\uFEFFline 2');
  });

  it('returns a no-content notice when offset is beyond EOF or hits a trailing blank line', async () => {
    const beyondEof = await executeRead(createSandboxInstance('line 1\nline 2'), {
      path: 'notes.txt',
      offset: 3
    });
    const trailingBlankSandbox = createSandboxInstance('alpha\n');
    const firstPage = await executeRead(trailingBlankSandbox, {
      path: 'trailing.txt',
      offset: 1,
      limit: 1
    });
    const secondPage = await executeRead(trailingBlankSandbox, {
      path: 'trailing.txt',
      offset: 2
    });

    expect(beyondEof.response).toBe(
      '[File exists but has no content at or after offset 3: notes.txt]'
    );
    expect(firstPage.response).toBe('1→alpha\n\n[Showing lines 1-1. Use offset=2 to continue.]');
    expect(secondPage.response).toBe(
      '[File exists but has no content at or after offset 2: trailing.txt]'
    );
  });

  it('aborts stream early and returns a shell hint when the first line exceeds the byte limit', async () => {
    let chunksPulled = 0;
    const hugeStreamSandbox = {
      ensureAvailable: vi.fn(async () => undefined),
      resolveRuntimePath: vi.fn((path: string) => `/workspace/sessions/chat_1/${path}`),
      opensandbox: {
        readFileStream: vi.fn(() =>
          (async function* () {
            for (let i = 0; i < 100; i += 1) {
              chunksPulled += 1;
              yield Buffer.alloc(16 * 1024, 'a');
            }
          })()
        )
      }
    } as any;

    const oversizedStream = await executeRead(hugeStreamSandbox, { path: 'huge.txt' });
    const oversizedWithPrefix = await executeRead(
      createSandboxInstance('a'.repeat(50 * 1024 - 1)),
      { path: 'border.txt' }
    );

    expect(chunksPulled).toBeLessThan(10);
    expect(oversizedStream.response).toBe(
      "[Line 1 exceeds 51200 byte limit. Use sandbox_shell: sed -n '1p' huge.txt | head -c 51200]"
    );
    expect(oversizedWithPrefix.response).toBe(
      "[Line 1 exceeds 51200 byte limit. Use sandbox_shell: sed -n '1p' border.txt | head -c 51200]"
    );
  });

  it('truncates multi-line output by byte limit without mislabeling probe-line overflow', async () => {
    const chunk = '中'.repeat(7000); // 21000 bytes
    const byBytes = await executeRead(
      createSandboxInstance(`${chunk}\n${chunk}\n${chunk}`, { chunkSize: 8192 }),
      { path: 'bytes.txt' }
    );
    const byLimit = await executeRead(createSandboxInstance(`${chunk}\n${chunk}\n${chunk}`), {
      path: 'bytes.txt',
      offset: 1,
      limit: 2
    });

    expect(byBytes.response).toContain(`1→${chunk}\n2→${chunk}`);
    expect(byBytes.response).not.toContain('3→');
    expect(byBytes.response).toContain(
      '[Showing lines 1-2 (51200 byte limit). Use offset=3 to continue.]'
    );
    expect(byLimit.response).toContain(`1→${chunk}\n2→${chunk}`);
    expect(byLimit.response).toContain('[Showing lines 1-2. Use offset=3 to continue.]');
  });

  it('wraps stream errors with cause preserved', async () => {
    const cause = new Error('permission denied');
    const sandboxInstance = {
      ensureAvailable: vi.fn(async () => undefined),
      resolveRuntimePath: vi.fn((path: string) => `/workspace/sessions/chat_1/${path}`),
      opensandbox: {
        readFileStream: vi.fn(() =>
          (async function* () {
            throw cause;
          })()
        )
      }
    } as any;

    const error = await executeRead(sandboxInstance, { path: 'blocked.txt' }).catch((err) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Failed to read file: permission denied');
    expect(error.cause).toBe(cause);
  });
});
