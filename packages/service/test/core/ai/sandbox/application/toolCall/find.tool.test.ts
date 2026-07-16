import { describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { sandboxFindTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/find.tool';

const createSandboxInstance = () =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    exec: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 }))
  }) as any;

describe('sandboxFindTool', () => {
  it('returns relative paths as newline-delimited text', async () => {
    const sandbox = createSandboxInstance();
    sandbox.exec.mockResolvedValueOnce({
      stdout: './src/a.ts\n./src/b.ts\n',
      stderr: '',
      exitCode: 0
    });

    const result = await sandboxFindTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat',
      sandboxInstance: sandbox,
      params: { pattern: '*.ts', path: 'src dir' }
    });

    expect(result.response).toBe('src/a.ts\nsrc/b.ts');
    expect(sandbox.exec).toHaveBeenCalledWith(
      "cd 'src dir' && rg --files --hidden --glob '*.ts' -- . | head -n 1001"
    );
  });

  it('returns a stable empty result', async () => {
    const sandbox = createSandboxInstance();

    await expect(
      sandboxFindTool.execute({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app',
        userId: 'user',
        chatId: 'chat',
        sandboxInstance: sandbox,
        params: { pattern: '*.missing' }
      })
    ).resolves.toEqual({ response: 'No files found matching pattern' });
  });

  it('reports result limits and propagates command errors', async () => {
    const sandbox = createSandboxInstance();
    sandbox.exec.mockResolvedValueOnce({ stdout: 'a.ts\nb.ts', stderr: '', exitCode: 0 });

    const result = await sandboxFindTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat',
      sandboxInstance: sandbox,
      params: { pattern: '*.ts', limit: 1 }
    });
    expect(result.response).toBe('a.ts\n\n[1 results limit reached]');

    sandbox.exec.mockResolvedValueOnce({ stdout: '', stderr: 'missing directory', exitCode: 1 });
    await expect(
      sandboxFindTool.execute({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app',
        userId: 'user',
        chatId: 'chat',
        sandboxInstance: sandbox,
        params: { pattern: '*.ts', path: 'missing' }
      })
    ).rejects.toThrow('missing directory');
  });
});
