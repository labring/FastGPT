import { describe, expect, it, vi } from 'vitest';
import { sandboxShellTool } from '@fastgpt/service/core/ai/sandbox/toolCall/shell.tool';

const createSandboxInstance = () =>
  ({
    exec: vi.fn(async () => ({ stdout: 'out', stderr: '', exitCode: 0 }))
  }) as any;

describe('sandboxShellTool', () => {
  it('runs shell commands through the sandbox client', async () => {
    const sandbox = createSandboxInstance();

    const result = await sandboxShellTool.execute({
      appId: 'app',
      userId: 'user',
      chatId: 'chat',
      sandboxInstance: sandbox,
      params: { command: 'echo hi', timeout: 3 }
    });

    expect(JSON.parse(result.response)).toEqual({ stdout: 'out', stderr: '', exitCode: 0 });
    expect(sandbox.exec).toHaveBeenCalledWith('echo hi', 3);
  });
});
