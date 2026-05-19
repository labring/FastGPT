import { describe, expect, it, vi } from 'vitest';
import { sandboxReadFileTool } from '@fastgpt/service/core/ai/sandbox/toolCall/readFile.tool';

const createSandboxInstance = (content: string) =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    provider: {
      readFiles: vi.fn(async (paths: string[]) =>
        paths.map((path) => ({
          path,
          content: Buffer.from(content)
        }))
      )
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
});
