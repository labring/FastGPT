import { describe, expect, it } from 'vitest';
import { CommandExecutionError, SandboxException } from '@/errors';

describe('sandbox errors', () => {
  it('serializes the shared error fields and cause', () => {
    const cause = new Error('root cause');
    const error = new SandboxException('failed', 'UNEXPECTED_RESPONSE', cause);

    expect(error.toJSON()).toMatchObject({
      name: 'SandboxException',
      message: 'failed',
      code: 'UNEXPECTED_RESPONSE',
      cause
    });
  });

  it('preserves process results and exposes a combined diagnostic', () => {
    const error = new CommandExecutionError('failed', 'exit 1', 1, 'stdout', 'stderr');

    expect(error).toMatchObject({
      code: 'COMMAND_FAILED',
      command: 'exit 1',
      exitCode: 1,
      stdout: 'stdout',
      stderr: 'stderr'
    });
    expect(error.getCombinedOutput()).toBe('stdout\nstderr');
    expect(new CommandExecutionError('failed', 'exit 1', 1, '', 'stderr').getCombinedOutput()).toBe(
      'stderr'
    );
  });

  it('preserves command causes without inventing process output', () => {
    const cause = new Error('transport failed');
    const error = new CommandExecutionError('failed', 'echo test', cause);

    expect(error.commandError).toBe(cause);
    expect(error.cause).toBe(cause);
    expect(error.getCombinedOutput()).toBe('');
  });
});
