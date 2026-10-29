import { assert, describe, expect, it } from 'vitest';
import {
  anyValueDecrypt,
  decryptSecretValue,
  encryptSecretValue,
  getSecretValue,
  resolveSecretValue,
  storeSecretValue
} from '@fastgpt/service/common/secret/utils';
import { decryptSecret, encryptSecret } from '@fastgpt/service/common/secret/aes256gcm';
import { HeaderSecretTypeEnum } from '@fastgpt/global/common/secret/constants';

const reference = { ref: ['node', 'token'] as [string, string] };

describe('decryptSecretValue', () => {
  it('decodes canonical and legacy static credentials with plaintext precedence', () => {
    const cipher = encryptSecret('encrypted');
    expect(decryptSecretValue({ value: 'plain' })).toBe('plain');
    expect(decryptSecretValue({ secret: cipher })).toBe('encrypted');
    expect(decryptSecretValue({ value: 'replacement', secret: cipher })).toBe('replacement');
    expect(decryptSecretValue({ value: '', secret: cipher })).toBe('encrypted');
    expect(decryptSecretValue(JSON.stringify({ value: '', secret: cipher }))).toBe('encrypted');
  });

  it('preserves references and values outside the credential protocol', () => {
    expect(decryptSecretValue(reference)).toEqual(reference);
    for (const value of [
      undefined,
      null,
      false,
      0,
      'plain',
      {},
      { value: 'business', extra: true },
      { value: 'plain', ref: ['node', 'token'] }
    ]) {
      expect(decryptSecretValue(value)).toBe(value);
    }
  });

  it('propagates ciphertext authentication failures', () => {
    const cipher = encryptSecret('plain');
    const tampered = cipher.slice(0, -1) + (cipher.endsWith('0') ? '1' : '0');
    expect(() => decryptSecretValue({ secret: tampered })).toThrow();
  });
});

describe('resolveSecretValue', () => {
  it('resolves references without coercing their results and delegates static decoding', () => {
    for (const result of ['', 0, false, null, ['token']]) {
      expect(resolveSecretValue({ value: reference, resolveReference: () => result })).toBe(result);
    }
    expect(resolveSecretValue({ value: { secret: encryptSecret('static') } })).toBe('static');
    expect(resolveSecretValue({ value: 'raw' })).toBe('raw');
  });

  it('rejects missing workflow context and unresolved values', () => {
    expect(() => resolveSecretValue({ value: reference })).toThrow('requires workflow context');
    expect(() =>
      resolveSecretValue({ value: reference, resolveReference: () => undefined })
    ).toThrow('resolved to undefined');
  });
});

describe('encryptSecretValue', () => {
  it('encrypts nonempty plaintext and retains an empty value as unconfigured', () => {
    const encrypted = encryptSecretValue({ value: '密钥🔑' });
    assert('secret' in encrypted);
    expect(encrypted).toEqual({ secret: expect.any(String) });
    expect(decryptSecret(encrypted.secret)).toBe('密钥🔑');
    expect(encryptSecretValue({ value: '' })).toEqual({ value: '' });
  });

  it('preserves ciphertext and references without double encryption', () => {
    for (const value of [{ secret: encryptSecret('existing') }, reference]) {
      expect(encryptSecretValue(value)).toEqual(value);
    }
  });

  it('preserves values outside the declared protocol at runtime', () => {
    for (const value of [null, undefined, 'raw', { extra: true }]) {
      // @ts-expect-error - invalid historical runtime input must remain untouched
      expect(encryptSecretValue(value)).toBe(value);
    }
  });
});

describe('storeSecretValue', () => {
  it('stores a mixed credential map without mutating it', () => {
    const input = {
      plain: { value: 'new' },
      cipher: { secret: encryptSecret('old') },
      reference,
      empty: { value: '' }
    };
    const result = storeSecretValue(input);
    expect(result).toEqual({
      plain: { secret: expect.any(String) },
      cipher: input.cipher,
      reference,
      empty: { value: '' }
    });
    expect(decryptSecretValue(result.plain)).toBe('new');
    expect(input.plain).toEqual({ value: 'new' });
    expect(storeSecretValue()).toEqual({});
    expect(storeSecretValue({})).toEqual({});
  });
});

describe('getSecretValue', () => {
  it.each([HeaderSecretTypeEnum.Bearer, HeaderSecretTypeEnum.Basic])(
    'adds the %s scheme once after resolving the credential',
    (scheme) => {
      expect(
        getSecretValue({ storeSecret: { [scheme]: reference }, resolveReference: () => 'token' })
      ).toEqual({ Authorization: `${scheme} token` });
    }
  );

  it('decodes custom headers and skips empty keys, values, and invalid wrappers', () => {
    expect(
      getSecretValue({
        storeSecret: {
          'X-Plain': { value: 'plain' },
          'X-Cipher': { secret: encryptSecret('cipher') },
          // @ts-expect-error - historical JSON transport is normalized by the shared parser
          'X-Legacy': JSON.stringify({ value: '', secret: encryptSecret('legacy') }),
          '': { value: 'ignored' },
          'X-Empty': { value: '' },
          'X-Empty-Cipher': { secret: '' },
          // @ts-expect-error - invalid runtime entries are ignored
          'X-Invalid': 'raw'
        }
      })
    ).toEqual({ 'X-Plain': 'plain', 'X-Cipher': 'cipher', 'X-Legacy': 'legacy' });
    expect(getSecretValue({})).toEqual({});
    expect(getSecretValue({ storeSecret: {} })).toEqual({});
  });

  it('uses the last configured authentication scheme for Authorization', () => {
    expect(
      getSecretValue({
        storeSecret: {
          Bearer: { value: 'bearer' },
          Basic: { value: 'basic' }
        }
      })
    ).toEqual({ Authorization: 'Basic basic' });
  });

  it('rejects non-string results even when they are falsy or use an empty header key', () => {
    for (const result of [null, 0, false, [], {}]) {
      for (const key of ['X-Token', '']) {
        expect(() =>
          getSecretValue({ storeSecret: { [key]: reference }, resolveReference: () => result })
        ).toThrow(`Secret header ${key || '<empty>'} must resolve to a string`);
      }
    }
  });
});

describe('anyValueDecrypt', () => {
  it('delegates credentials to the shared decoder after transport parsing', () => {
    const value = { value: '', secret: encryptSecret('legacy') };
    expect(anyValueDecrypt(value)).toBe('legacy');
    expect(anyValueDecrypt(JSON.stringify(value))).toBe('legacy');
    expect(anyValueDecrypt(JSON.stringify(reference))).toEqual(reference);
  });

  it('retains generic JSON transport parsing and native values', () => {
    expect(anyValueDecrypt('{"business":true}')).toEqual({ business: true });
    expect(anyValueDecrypt('42')).toBe(42);
    expect(anyValueDecrypt('null')).toBeNull();
    expect(anyValueDecrypt('')).toBe('');
    expect(anyValueDecrypt(false)).toBe(false);
  });
});
