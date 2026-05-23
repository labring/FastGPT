import { describe, expect, it, vi } from 'vitest';
import { sandboxShellTool } from '@fastgpt/service/core/ai/sandbox/toolCall/shell.tool';

const createSandboxInstance = () =>
  ({
    exec: vi.fn(async () => ({ stdout: 'out', stderr: '', exitCode: 0 }))
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
