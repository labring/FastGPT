import { describe, expect, it, vi } from 'vitest';
import { sandboxShellTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/shell.tool';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const createSandboxInstance = () =>
  ({
    exec: vi.fn(async () => ({ stdout: 'out', stderr: '', exitCode: 0, truncated: false })),
    provider: {
      deleteFiles: vi.fn(async () => [])
    }
  }) as any;

describe('sandboxShellTool', () => {
  it('rejects shell timeout larger than max before executing sandbox', () => {
    const sandbox = createSandboxInstance();

    expect(() => sandboxShellTool.zodSchema.parse({ command: 'sleep 1', timeout: 601 })).toThrow();
    expect(sandbox.exec).not.toHaveBeenCalled();
  });

  it('rejects non-positive shell timeout before executing sandbox', () => {
    const sandbox = createSandboxInstance();

    expect(() => sandboxShellTool.zodSchema.parse({ command: 'sleep 1', timeout: 0 })).toThrow();
    expect(() => sandboxShellTool.zodSchema.parse({ command: 'sleep 1', timeout: -1 })).toThrow();
    expect(sandbox.exec).not.toHaveBeenCalled();
  });

  it('runs shell commands through the sandbox client', async () => {
    const sandbox = createSandboxInstance();

    const result = await sandboxShellTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat',
      sandboxInstance: sandbox,
      params: { command: 'echo hi', timeout: 3 }
    });

    expect(result.response).toBe('out');
    expect(sandbox.exec).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\/bin\/bash -c 'echo hi' > '\/tmp\/fastgpt-bash-[^']+\.log' 2>&1\nexit_code=\$\?\ncat '\/tmp\/fastgpt-bash-[^']+\.log'\nexit "\$exit_code"$/
      ),
      3
    );
    expect(sandbox.provider.deleteFiles).toHaveBeenCalledWith([
      expect.stringMatching(/^\/tmp\/fastgpt-bash-[^.]+\.log$/)
    ]);
  });

  it('returns combined output and a non-zero exit status as plain text', async () => {
    const sandbox = createSandboxInstance();
    sandbox.exec.mockResolvedValueOnce({ stdout: 'out', stderr: 'err', exitCode: 2 });

    const result = await sandboxShellTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat',
      sandboxInstance: sandbox,
      params: { command: 'bad-command' }
    });

    expect(result.response).toBe('out\nerr\n\nCommand exited with code 2');
  });

  it('keeps the tail of long output and points to the full output file', async () => {
    const sandbox = createSandboxInstance();
    sandbox.exec.mockResolvedValueOnce({
      stdout: Array.from({ length: 2001 }, (_, index) => `line ${index + 1}`).join('\n'),
      stderr: '',
      exitCode: 0
    });

    const result = await sandboxShellTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat',
      sandboxInstance: sandbox,
      params: { command: 'generate-output' }
    });

    expect(result.response).toContain('line 2\nline 3');
    expect(result.response).not.toContain('line 1\nline 2');
    expect(result.response).toMatch(
      /\[Showing last 2000 of 2001 lines\. Full output: \/tmp\/fastgpt-bash-[^.]+\.log\]/
    );
    expect(sandbox.provider.deleteFiles).not.toHaveBeenCalled();
  });
});
