import { describe, expect, it, vi } from 'vitest';
import { sandboxReadFileTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/readFile.tool';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const createSandboxInstance = (content: unknown) =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    resolveRuntimePath: vi.fn((path: string) => `/workspace/sessions/chat_1/${path}`),
    provider: {
      readFiles: vi.fn(async (paths: string[]) =>
        paths.map((path) => ({
          path,
          content: typeof content === 'string' ? Buffer.from(content) : content
        }))
      )
    }
  }) as any;

const createFailedSandboxInstance = (file: unknown) =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    resolveRuntimePath: vi.fn((path: string) => `/workspace/sessions/chat_1/${path}`),
    provider: {
      readFiles: vi.fn(async () => [file])
    }
  }) as any;

describe('sandboxReadFileTool', () => {
  it('reads a whole file', async () => {
    const sandboxInstance = createSandboxInstance('line 1\nline 2\nline 3');

    const result = await sandboxReadFileTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      sandboxInstance,
      params: {
        path: 'notes.txt'
      }
    });

    expect(result.response).toBe('line 1\nline 2\nline 3');
    expect(sandboxInstance.ensureAvailable).toHaveBeenCalledTimes(1);
    expect(sandboxInstance.provider.readFiles).toHaveBeenCalledWith([
      '/workspace/sessions/chat_1/notes.txt'
    ]);
  });

  it('reads a line range and returns a continuation hint', async () => {
    const sandboxInstance = createSandboxInstance('line 1\nline 2\nline 3\nline 4');

    const result = await sandboxReadFileTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      sandboxInstance,
      params: {
        path: 'notes.txt',
        offset: 2,
        limit: 2
      }
    });

    expect(result.response).toBe(
      'line 2\nline 3\n\n[1 more lines in file. Use offset=4 to continue.]'
    );
  });

  it('decodes non-binary file content', async () => {
    const sandboxInstance = createSandboxInstance('plain text');
    sandboxInstance.provider.readFiles.mockResolvedValueOnce([
      {
        path: 'notes.txt',
        content: 12345
      }
    ]);

    const result = await sandboxReadFileTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      sandboxInstance,
      params: {
        path: 'notes.txt',
        limit: 10
      }
    });

    expect(result.response).toBe('12345');
  });

  it('decodes nullish file content as an empty string', async () => {
    const sandboxInstance = createSandboxInstance(null);

    const result = await sandboxReadFileTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      sandboxInstance,
      params: {
        path: 'empty.txt'
      }
    });

    expect(result.response).toBe('');
  });

  it('rejects an offset beyond the end of the file', async () => {
    const sandboxInstance = createSandboxInstance('line 1\nline 2');

    await expect(
      sandboxReadFileTool.execute({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app_1',
        userId: 'user_1',
        chatId: 'chat_1',
        sandboxInstance,
        params: {
          path: 'notes.txt',
          offset: 3
        }
      })
    ).rejects.toThrow('Offset 3 is beyond end of file (2 lines total)');
  });

  it('returns an actionable message when the first selected line exceeds the byte limit', async () => {
    const sandboxInstance = createSandboxInstance('a'.repeat(50 * 1024 + 1));

    const result = await sandboxReadFileTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      sandboxInstance,
      params: {
        path: 'large.txt'
      }
    });

    expect(result.response).toContain('exceeds 51200 byte limit');
    expect(result.response).toContain("sed -n '1p' large.txt | head -c 51200");
  });

  it('truncates a long file and returns the next offset', async () => {
    const sandboxInstance = createSandboxInstance(
      Array.from({ length: 2001 }, (_, index) => `line ${index + 1}`).join('\n')
    );

    const result = await sandboxReadFileTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      sandboxInstance,
      params: {
        path: 'large.txt'
      }
    });

    expect(result.response).toContain('line 1\nline 2');
    expect(result.response).toContain(
      '[Showing lines 1-2000 of 2001. Use offset=2001 to continue.]'
    );
  });

  it('throws when provider returns no readable file', async () => {
    const sandboxInstance = createFailedSandboxInstance(undefined);

    await expect(
      sandboxReadFileTool.execute({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app_1',
        userId: 'user_1',
        chatId: 'chat_1',
        sandboxInstance,
        params: {
          path: 'missing.txt'
        }
      })
    ).rejects.toThrow('Failed to read file: missing.txt');
  });

  it('throws provider file errors', async () => {
    const sandboxInstance = createFailedSandboxInstance({
      error: {
        message: 'permission denied'
      }
    });

    await expect(
      sandboxReadFileTool.execute({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app_1',
        userId: 'user_1',
        chatId: 'chat_1',
        sandboxInstance,
        params: {
          path: 'blocked.txt'
        }
      })
    ).rejects.toThrow('Failed to read file: permission denied');
  });
});
