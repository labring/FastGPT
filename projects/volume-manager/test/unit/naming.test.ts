import { describe, it, expect } from 'vitest';
import { toVolumeName } from '../../src/utils/naming';

describe('toVolumeName', () => {
  it('returns prefix-sessionId for valid 24-char hex', () => {
    const id = 'a'.repeat(24);
    expect(toVolumeName('fastgpt-session', id)).toBe(`fastgpt-session-${id}`);
  });

  it('accepts mixed-case hex', () => {
    const id = 'aAbBcCdDeEfF001122334455';
    expect(toVolumeName('pfx', id)).toBe(`pfx-${id}`);
  });

  it('throws for sessionId shorter than 24 chars', () => {
    expect(() => toVolumeName('pfx', 'abc123')).toThrow('Invalid sessionId');
  });

  it('throws for sessionId longer than 24 chars', () => {
    expect(() => toVolumeName('pfx', 'a'.repeat(25))).toThrow('Invalid sessionId');
  });

  it('throws for non-hex characters', () => {
    expect(() => toVolumeName('pfx', 'z'.repeat(24))).toThrow('Invalid sessionId');
  });
});
