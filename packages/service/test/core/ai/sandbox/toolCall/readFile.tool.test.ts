import { describe, expect, it, vi } from 'vitest';
import { sandboxReadFileTool } from '@fastgpt/service/core/ai/sandbox/toolCall/readFile.tool';

const createSandboxInstance = (content: unknown) =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
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
    provider: {
      readFiles: vi.fn(async () => [file])
    }
  }) as any;

describe('sandboxReadFileTool', () => {
  it('reads a whole file', async () => {
    const sandboxInstance = createSandboxInstance('line 1\nline 2\nline 3');

    const result = await sandboxReadFileTool.execute({
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      sandboxInstance,
      params: {
        path: 'notes.txt'
      }
    });

    expect(JSON.parse(result.response)).toEqual({
      path: 'notes.txt',
      startLine: 1,
      endLine: 3,
      totalLines: 3,
      content: 'line 1\nline 2\nline 3'
    });
    expect(sandboxInstance.ensureAvailable).toHaveBeenCalledTimes(1);
    expect(sandboxInstance.provider.readFiles).toHaveBeenCalledWith(['notes.txt']);
  });

  it('reads an inclusive line range', async () => {
    const sandboxInstance = createSandboxInstance('line 1\nline 2\nline 3\nline 4');

    const result = await sandboxReadFileTool.execute({
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      sandboxInstance,
      params: {
        path: 'notes.txt',
        startLine: 2,
        endLine: 3
      }
    });

    expect(JSON.parse(result.response)).toEqual({
      path: 'notes.txt',
      startLine: 2,
      endLine: 3,
      totalLines: 4,
      content: 'line 2\nline 3'
    });
  });

  it('decodes non-binary file content and clamps the returned end line', async () => {
    const sandboxInstance = createSandboxInstance('plain text');
    sandboxInstance.provider.readFiles.mockResolvedValueOnce([
      {
        path: 'notes.txt',
        content: 12345
      }
    ]);

    const result = await sandboxReadFileTool.execute({
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      sandboxInstance,
      params: {
        path: 'notes.txt',
        endLine: 10
      }
    });

    expect(JSON.parse(result.response)).toEqual({
      path: 'notes.txt',
      startLine: 1,
      endLine: 1,
      totalLines: 1,
      content: '12345'
    });
  });

  it('decodes nullish file content as an empty string', async () => {
    const sandboxInstance = createSandboxInstance(null);

    const result = await sandboxReadFileTool.execute({
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      sandboxInstance,
      params: {
        path: 'empty.txt'
      }
    });

    expect(JSON.parse(result.response)).toEqual({
      path: 'empty.txt',
      startLine: 1,
      endLine: 1,
      totalLines: 1,
      content: ''
    });
  });

  it('throws when provider returns no readable file', async () => {
    const sandboxInstance = createFailedSandboxInstance(undefined);

    await expect(
      sandboxReadFileTool.execute({
        appId: 'app_1',
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
        appId: 'app_1',
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
