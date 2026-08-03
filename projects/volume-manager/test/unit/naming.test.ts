import { describe, expect, it } from 'vitest';
import { validateVolumeName } from '../../src/utils/naming';

describe('validateVolumeName', () => {
  it('accepts an exact generated claimName', () => {
    const name = 'fastgpt-session-a1b2c3-generation';
    expect(validateVolumeName(name)).toBe(name);
  });

  it.each(['-abc123', 'abc123-', '', 'abc_123', 'FASTGPT-SESSION-ABC123'])(
    'rejects invalid name %j',
    (name) => {
      expect(() => validateVolumeName(name)).toThrow('Invalid volume name');
    }
  );
});
