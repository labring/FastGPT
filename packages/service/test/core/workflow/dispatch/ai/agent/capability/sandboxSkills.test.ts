import { describe, it, expect } from 'vitest';
import { isSandboxExpiredError } from '@fastgpt/service/core/workflow/dispatch/ai/agent/capability/sandboxSkills';
import {
  allSandboxTools,
  SandboxToolIds
} from '@fastgpt/global/core/workflow/node/agent/skillTools';

describe('isSandboxExpiredError', () => {
  it('should return true for "not found" error', () => {
    const error = new Error('Sandbox not found');
    expect(isSandboxExpiredError(error)).toBe(true);
  });

  it('should return true for "not exist" error', () => {
    const error = new Error('Container does not exist');
    expect(isSandboxExpiredError(error)).toBe(true);
  });

  it('should return true for "connection" error', () => {
    const error = new Error('Connection timeout');
    expect(isSandboxExpiredError(error)).toBe(true);
  });

  it('should return true for "sandbox_not_found" error', () => {
    const error = new Error('sandbox_not_found: instance expired');
    expect(isSandboxExpiredError(error)).toBe(true);
  });

  it('should return true for "ECONNREFUSED" error', () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:8080');
    expect(isSandboxExpiredError(error)).toBe(true);
  });

  it('should return true for "ECONNRESET" error', () => {
    const error = new Error('read ECONNRESET');
    expect(isSandboxExpiredError(error)).toBe(true);
  });

  it('should return false for unrelated error', () => {
    const error = new Error('Permission denied');
    expect(isSandboxExpiredError(error)).toBe(false);
  });

  it('should return false for non-Error types', () => {
    expect(isSandboxExpiredError('string error')).toBe(false);
    expect(isSandboxExpiredError(null)).toBe(false);
    expect(isSandboxExpiredError(undefined)).toBe(false);
    expect(isSandboxExpiredError({ message: 'not found' })).toBe(false);
    expect(isSandboxExpiredError(123)).toBe(false);
  });

  it('should be case insensitive', () => {
    const error = new Error('SANDBOX NOT FOUND');
    expect(isSandboxExpiredError(error)).toBe(true);
  });
});

describe('sandbox skills tool protocol', () => {
  it('should expose the current sandbox tool set without the removed read file tool', () => {
    const toolNames = allSandboxTools.map((tool) => tool.function.name);

    expect(toolNames).toEqual([
      SandboxToolIds.writeFile,
      SandboxToolIds.editFile,
      SandboxToolIds.execute,
      SandboxToolIds.search,
      SandboxToolIds.fetchUserFile
    ]);
    expect(toolNames).not.toContain('sandbox_read_file');
  });
});
