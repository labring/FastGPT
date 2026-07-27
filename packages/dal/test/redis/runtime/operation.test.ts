import { describe, expect, it, vi } from 'vitest';
import {
  RedisInvalidResponseError,
  RedisOperationExecutionError,
  RedisOperationTimeoutError
} from '@fastgpt/dal/redis/runtime';
import { executeRedisOperation } from '@fastgpt/dal/redis/runtime/operation';

describe('executeRedisOperation', () => {
  it('returns successful results without retrying', async () => {
    const execute = vi.fn().mockResolvedValue('value');

    await expect(executeRedisOperation({ operation: 'string.get', execute })).resolves.toBe(
      'value'
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([new Error('ECONNRESET'), 'READONLY replica'])(
    'retries allowlisted idempotent operations after transient error %s',
    async (error) => {
      const execute = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('value');

      await expect(executeRedisOperation({ operation: 'string.get', execute })).resolves.toBe(
        'value'
      );
      expect(execute).toHaveBeenCalledTimes(2);
    }
  );

  it('does not retry non-transient failures', async () => {
    const cause = new Error('WRONGTYPE');
    const execute = vi.fn().mockRejectedValue(cause);

    const error = await executeRedisOperation({ operation: 'string.get', execute }).catch(
      (error) => error
    );

    expect(error).toBeInstanceOf(RedisOperationExecutionError);
    expect(error).toMatchObject({
      code: 'REDIS_OPERATION_FAILED',
      operation: 'string.get',
      role: 'command',
      attempt: 1,
      outcome: 'failed',
      cause
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each(['string.delete', 'string.setIfAbsent'] as const)(
    'never retries result-sensitive write %s after a transient error',
    async (operation) => {
      const execute = vi.fn().mockRejectedValue(new Error('ECONNRESET'));

      const error = await executeRedisOperation({ operation, execute }).catch((error) => error);

      expect(error).toMatchObject({
        code: 'REDIS_OPERATION_FAILED',
        operation,
        attempt: 1,
        outcome: 'unknown'
      });
      expect(execute).toHaveBeenCalledTimes(1);
    }
  );

  it('retries idempotent multi-key deletion after a transient error', async () => {
    const execute = vi.fn().mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(2);

    await expect(executeRedisOperation({ operation: 'string.deleteMany', execute })).resolves.toBe(
      2
    );
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not retry atomic get-or-set after a transient error', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('ECONNRESET'));

    await expect(
      executeRedisOperation({ operation: 'string.getOrSet', execute })
    ).rejects.toMatchObject({
      code: 'REDIS_OPERATION_FAILED',
      operation: 'string.getOrSet',
      attempt: 1,
      outcome: 'unknown'
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('marks read timeout as failed after its single retry', async () => {
    vi.useFakeTimers();
    try {
      const execute = vi.fn(() => new Promise<string>(() => undefined));
      const operationPromise = executeRedisOperation({
        operation: 'string.get',
        execute,
        timeoutMs: 10
      });
      const assertion = expect(operationPromise).rejects.toMatchObject({
        code: 'REDIS_OPERATION_TIMEOUT',
        attempt: 2,
        outcome: 'failed',
        timeoutMs: 10
      });

      await vi.advanceTimersByTimeAsync(20);
      await assertion;
      expect(execute).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks a result-sensitive write timeout as outcome unknown', async () => {
    vi.useFakeTimers();
    try {
      const writePromise = executeRedisOperation({
        operation: 'string.delete',
        execute: () => new Promise(() => undefined),
        timeoutMs: 10
      });
      const writeAssertion = expect(writePromise).rejects.toMatchObject({
        role: 'command',
        outcome: 'unknown'
      });

      await vi.advanceTimersByTimeAsync(10);
      await writeAssertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves stable operation errors without wrapping or retrying', async () => {
    const expected = new RedisInvalidResponseError({
      operation: 'string.get',
      message: 'invalid response'
    });
    const execute = vi.fn().mockRejectedValue(expected);

    await expect(executeRedisOperation({ operation: 'string.get', execute })).rejects.toBe(
      expected
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1.5, Number.NaN])(
    'rejects invalid timeout override %s before execution',
    async (timeoutMs) => {
      const execute = vi.fn().mockResolvedValue('value');

      await expect(
        executeRedisOperation({ operation: 'string.get', execute, timeoutMs })
      ).rejects.toMatchObject({ code: 'REDIS_INVALID_ARGUMENT', outcome: 'not-started' });
      expect(execute).not.toHaveBeenCalled();
    }
  );

  it('exposes concrete timeout errors for instanceof checks', () => {
    const error = new RedisOperationTimeoutError({
      operation: 'string.delete',
      timeoutMs: 10,
      attempt: 1,
      outcome: 'unknown'
    });

    expect(error).toBeInstanceOf(RedisOperationTimeoutError);
    expect(error.message).not.toContain('key');
  });
});
