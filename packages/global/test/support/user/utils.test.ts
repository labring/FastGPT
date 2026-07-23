import { describe, expect, it } from 'vitest';
import { hasStoredPassword } from '@fastgpt/global/support/user/utils';

describe('hasStoredPassword', () => {
  it.each([undefined, null, '', 0, false])('treats %j as no stored password', (password) => {
    expect(hasStoredPassword(password)).toBe(false);
  });

  it.each(['digest', ' '])('treats a non-empty string as a stored password', (password) => {
    expect(hasStoredPassword(password)).toBe(true);
  });
});
