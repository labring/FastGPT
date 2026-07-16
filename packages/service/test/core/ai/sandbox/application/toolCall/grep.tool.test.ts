import { describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { sandboxGrepTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/grep.tool';

const createSandboxInstance = () =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    exec: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 }))
  }) as any;

const rgEvent = (type: 'match' | 'context', path: string, line: number, text: string) =>
  JSON.stringify({
    type,
    data: {
      path: { text: path },
      lines: { text: `${text}\n` },
      line_number: line
    }
  });

describe('sandboxGrepTool', () => {
  it('formats ripgrep matches and safely quotes every argument', async () => {
    const sandbox = createSandboxInstance();
    sandbox.exec.mockResolvedValueOnce({
      stdout: [
        rgEvent('context', 'src/a.ts', 1, 'before'),
        rgEvent('match', 'src/a.ts', 2, 'needle')
      ].join('\n'),
      stderr: '',
      exitCode: 0
    });

    const result = await sandboxGrepTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat',
      sandboxInstance: sandbox,
      params: {
        pattern: "it's here",
        path: 'src dir',
        glob: '*.ts',
        ignoreCase: true,
        literal: true,
        context: 1,
        limit: 10
      }
    });

    expect(result.response).toBe('src/a.ts-1- before\nsrc/a.ts:2: needle');
    expect(sandbox.ensureAvailable).toHaveBeenCalledTimes(1);
    expect(sandbox.exec).toHaveBeenCalledWith(
      expect.stringContaining("'--glob' '*.ts' '--context' '1' '--' 'it'\\''s here' 'src dir'")
    );
  });

  it('returns a stable empty result', async () => {
    const sandbox = createSandboxInstance();

    await expect(
      sandboxGrepTool.execute({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app',
        userId: 'user',
        chatId: 'chat',
        sandboxInstance: sandbox,
        params: { pattern: 'missing' }
      })
    ).resolves.toEqual({ response: 'No matches found' });
  });

  it('throws ripgrep errors when no match output is available', async () => {
    const sandbox = createSandboxInstance();
    sandbox.exec.mockResolvedValueOnce({ stdout: '', stderr: 'rg: invalid pattern', exitCode: 0 });

    await expect(
      sandboxGrepTool.execute({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app',
        userId: 'user',
        chatId: 'chat',
        sandboxInstance: sandbox,
        params: { pattern: '[' }
      })
    ).rejects.toThrow('rg: invalid pattern');
  });

  it('reports when the requested match limit is reached', async () => {
    const sandbox = createSandboxInstance();
    sandbox.exec.mockResolvedValueOnce({
      stdout: rgEvent('match', 'a.ts', 1, 'hit'),
      stderr: '',
      exitCode: 0
    });

    const result = await sandboxGrepTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat',
      sandboxInstance: sandbox,
      params: { pattern: 'hit', limit: 1 }
    });

    expect(result.response).toBe(
      'a.ts:1: hit\n\n[1 matches limit reached. Use limit=2 for more, or refine pattern]'
    );
  });
});
