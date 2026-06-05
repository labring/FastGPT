import { describe, expect, it } from 'vitest';
import { SANDBOX_SHELL_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import {
  createAgentLoopSandboxTools,
  isSandboxToolName,
  isAgentLoopSandboxToolName,
  toSandboxToolName,
  toAgentLoopSandboxToolName
} from '@fastgpt/service/core/ai/llm/agentLoop/systemTools/sandbox';

describe('agent loop system sandbox tools', () => {
  it('keeps raw sandbox tool names for LLM-visible internal tools', () => {
    expect(toAgentLoopSandboxToolName(SANDBOX_SHELL_TOOL_NAME)).toBe(SANDBOX_SHELL_TOOL_NAME);
    expect(toSandboxToolName(SANDBOX_SHELL_TOOL_NAME)).toBe(SANDBOX_SHELL_TOOL_NAME);
    expect(isSandboxToolName(SANDBOX_SHELL_TOOL_NAME)).toBe(true);
    expect(isAgentLoopSandboxToolName(`legacy_${SANDBOX_SHELL_TOOL_NAME}`)).toBe(false);
    expect(isAgentLoopSandboxToolName(SANDBOX_SHELL_TOOL_NAME)).toBe(true);
  });

  it('keeps sandbox schemas and original function names', () => {
    const shellTool = createAgentLoopSandboxTools().find(
      (tool) => tool.function.name === SANDBOX_SHELL_TOOL_NAME
    );

    expect(shellTool).toBeDefined();
    expect(shellTool?.function.parameters).toEqual({
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的 shell 命令' },
        timeout: {
          type: 'number',
          description: '超时秒数',
          max: 600,
          min: 1
        }
      },
      required: ['command']
    });
  });
});
