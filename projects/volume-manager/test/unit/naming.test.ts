import { describe, it, expect } from 'vitest';
import { toVolumeName } from '../../src/utils/naming';

describe('toVolumeName', () => {
  it('returns prefix-sessionId for valid 24-char hex', () => {
    const id = 'a'.repeat(24);
    expect(toVolumeName('fastgpt-session', id)).toBe(`fastgpt-session-${id}`);
  });

  it('normalizes uppercase to lowercase', () => {
    expect(toVolumeName('pfx', 'ABC123')).toBe('pfx-abc123');
  });

  it('accepts debug-mode sessionId', () => {
    const id = 'debug-69bb6a1aee77d10e6fb58e2d-7BdojPlukIQw';
    expect(toVolumeName('fastgpt-session', id)).toBe(`fastgpt-session-${id.toLowerCase()}`);
  });

  it('accepts single character sessionId', () => {
    expect(toVolumeName('pfx', 'a')).toBe('pfx-a');
  });

  it('throws for sessionId with leading hyphen', () => {
    expect(() => toVolumeName('pfx', '-abc123')).toThrow('Invalid sessionId');
  });

  it('throws for sessionId with trailing hyphen', () => {
    expect(() => toVolumeName('pfx', 'abc123-')).toThrow('Invalid sessionId');
  });

  it('throws for empty sessionId', () => {
    expect(() => toVolumeName('pfx', '')).toThrow('Invalid sessionId');
  });

  it('throws for sessionId with invalid characters', () => {
    expect(() => toVolumeName('pfx', 'abc_123')).toThrow('Invalid sessionId');
  });
});
