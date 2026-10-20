import { describe, expect, it } from 'vitest';
import { maskAccount } from '@fastgpt/service/support/user/account/utils';

describe('maskAccount', () => {
  it.each([
    ['customer@example.com', 'cu***@example.com'],
    ['13812345678', '138****5678'],
    ['abcd', 'a***'],
    ['abcde', 'ab***de'],
    ['', '']
  ])('masks %s without exposing the full account', (account, expected) => {
    expect(maskAccount(account)).toBe(expected);
  });
});
