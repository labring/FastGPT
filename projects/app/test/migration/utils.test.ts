import { describe, expect, it } from 'vitest';
import { systemMigrationLimits } from '@fastgpt/global/migration/constants';
import { assertMigrationCheckpointSize, normalizeMigrationFailure } from '@/migration/utils';

describe('system migration utils', () => {
  it('normalizes and bounds unknown errors', () => {
    const failure = normalizeMigrationFailure(
      new Error('x'.repeat(systemMigrationLimits.maxErrorMessageLength + 100))
    );

    expect(failure.message).toHaveLength(systemMigrationLimits.maxErrorMessageLength);
  });

  it('rejects circular and oversized checkpoints', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => assertMigrationCheckpointSize(circular)).toThrow('JSON serializable');
    expect(() =>
      assertMigrationCheckpointSize({
        value: 'x'.repeat(systemMigrationLimits.maxCheckpointBytes)
      })
    ).toThrow('exceeds');
  });
});
