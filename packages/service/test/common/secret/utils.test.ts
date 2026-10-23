import { describe, it, expect } from 'vitest';
import {
  encryptSecretValue,
  resolveSecretValue,
  storeSecretValue,
  getSecretValue,
  anyValueDecrypt
} from '@fastgpt/service/common/secret/utils';
import { encryptSecret, decryptSecret } from '@fastgpt/service/common/secret/aes256gcm';
import { HeaderSecretTypeEnum } from '@fastgpt/global/common/secret/constants';

describe('encryptSecretValue', () => {
  it('should return non-object value as-is', () => {
    // @ts-expect-error - testing runtime behavior
    expect(encryptSecretValue('string')).toBe('string');
    // @ts-expect-error - testing runtime behavior
    expect(encryptSecretValue(123)).toBe(123);
    // @ts-expect-error - testing runtime behavior
    expect(encryptSecretValue(null)).toBe(null);
    // @ts-expect-error - testing runtime behavior
    expect(encryptSecretValue(undefined)).toBe(undefined);
  });

  it('should encrypt an empty plain value into the canonical secret shape', () => {
    const input = { value: '' };
    const result = encryptSecretValue(input);

    expect(result).toHaveProperty('secret');
    expect('value' in result).toBe(false);
    expect(decryptSecret(result.secret)).toBe('');
  });

  it('should encrypt when value field is present', () => {
    const input = { value: 'my-api-key' };
    const result = encryptSecretValue(input);

    expect(result.secret).toBeTruthy();
    expect(result.secret).not.toBe('my-api-key');
    // Verify the encrypted secret can be decrypted back
    expect(decryptSecret(result.secret)).toBe('my-api-key');
  });

  it('should preserve an existing secret value', () => {
    const input = { secret: 'already-encrypted' };
    const result = encryptSecretValue(input);

    expect(result).toEqual(input);
  });

  it('should handle special characters in value', () => {
    const input = { value: 'p@ss!w0rd#$%^&*()' };
    const result = encryptSecretValue(input);

    expect(decryptSecret(result.secret)).toBe('p@ss!w0rd#$%^&*()');
  });

  it('should handle unicode characters in value', () => {
    const input = { value: '密钥值🔑' };
    const result = encryptSecretValue(input);

    expect(decryptSecret(result.secret)).toBe('密钥值🔑');
  });

  it('should preserve structured references without encrypting them', () => {
    const input = { ref: ['node-1', 'token'] as [string, string] };

    expect(encryptSecretValue(input)).toEqual(input);
  });
});

describe('storeSecretValue', () => {
  it('should return empty object for undefined input', () => {
    expect(storeSecretValue()).toEqual({});
  });

  it('should return empty object for empty input', () => {
    expect(storeSecretValue({})).toEqual({});
  });

  it('should encrypt all values in the store', () => {
    const input = {
      'X-Api-Key': { value: 'key-123' },
      'X-Token': { value: 'token-456' }
    };
    const result = storeSecretValue(input);

    expect(decryptSecret(result['X-Api-Key'].secret)).toBe('key-123');
    expect(decryptSecret(result['X-Token'].secret)).toBe('token-456');
  });

  it('should preserve an existing secret entry', () => {
    const input = {
      'X-Api-Key': { secret: 'already-encrypted' }
    };
    const result = storeSecretValue(input);

    expect(result['X-Api-Key']).toEqual(input['X-Api-Key']);
  });

  it('should handle mixed entries', () => {
    const input = {
      'X-Api-Key': { value: 'new-key' },
      'X-Token': { secret: 'already-encrypted' }
    };
    const result = storeSecretValue(input);

    expect(decryptSecret(result['X-Api-Key'].secret)).toBe('new-key');
    expect(result['X-Token']).toEqual({ secret: 'already-encrypted' });
  });

  it('should preserve structured references in the store', () => {
    const input = {
      Bearer: { ref: ['node-1', 'token'] as [string, string] }
    };

    expect(storeSecretValue(input)).toEqual(input);
  });
});

describe('getSecretValue', () => {
  it('should return empty object when storeSecret is undefined', () => {
    expect(getSecretValue({ storeSecret: undefined })).toEqual({});
  });

  it('should return empty object for empty storeSecret', () => {
    expect(getSecretValue({ storeSecret: {} })).toEqual({});
  });

  it('should decrypt secret and return plain value', () => {
    const encrypted = encryptSecret('my-api-key');
    const result = getSecretValue({
      storeSecret: {
        'X-Api-Key': { secret: encrypted }
      }
    });

    expect(result).toEqual({ 'X-Api-Key': 'my-api-key' });
  });

  it('should resolve deprecated legacy secret objects and JSON strings', () => {
    const legacyValue = { value: '', secret: encryptSecret('legacy-password') };

    expect(resolveSecretValue({ value: legacyValue })).toBe('legacy-password');
    expect(resolveSecretValue({ value: JSON.stringify(legacyValue) })).toBe('legacy-password');
  });

  it('should resolve a plain value wrapper', () => {
    const result = getSecretValue({
      storeSecret: {
        'X-Api-Key': { value: 'new-key' }
      }
    });

    expect(result).toEqual({ 'X-Api-Key': 'new-key' });
  });

  it('should convert Bearer type to Authorization header', () => {
    const encrypted = encryptSecret('my-token');
    const result = getSecretValue({
      storeSecret: {
        [HeaderSecretTypeEnum.Bearer]: { secret: encrypted }
      }
    });

    expect(result).toEqual({ Authorization: 'Bearer my-token' });
  });

  it('should convert Basic type to Authorization header', () => {
    const encrypted = encryptSecret('dXNlcjpwYXNz');
    const result = getSecretValue({
      storeSecret: {
        [HeaderSecretTypeEnum.Basic]: { secret: encrypted }
      }
    });

    expect(result).toEqual({ Authorization: 'Basic dXNlcjpwYXNz' });
  });

  it('should handle custom header keys', () => {
    const encrypted = encryptSecret('custom-value');
    const result = getSecretValue({
      storeSecret: {
        'X-Custom-Header': { secret: encrypted }
      }
    });

    expect(result).toEqual({ 'X-Custom-Header': 'custom-value' });
  });

  it('should filter out entries with empty actual value', () => {
    const result = getSecretValue({
      storeSecret: {
        'X-Api-Key': { secret: '' }
      }
    });

    expect(result).toEqual({});
  });

  it('should filter out entries with empty key', () => {
    const encrypted = encryptSecret('some-value');
    const result = getSecretValue({
      storeSecret: {
        '': { secret: encrypted }
      }
    });

    expect(result).toEqual({});
  });

  it('should skip non-object values', () => {
    const result = getSecretValue({
      storeSecret: {
        // @ts-expect-error - testing runtime behavior
        'X-Api-Key': 'plain-string'
      }
    });

    expect(result).toEqual({});
  });

  it('should handle multiple entries with mixed types', () => {
    const bearerEncrypted = encryptSecret('bearer-token');
    const basicEncrypted = encryptSecret('basic-cred');
    const customEncrypted = encryptSecret('custom-val');

    const result = getSecretValue({
      storeSecret: {
        [HeaderSecretTypeEnum.Bearer]: { secret: bearerEncrypted },
        [HeaderSecretTypeEnum.Basic]: { secret: basicEncrypted },
        'X-Custom': { secret: customEncrypted }
      }
    });

    // Bearer and Basic both write to Authorization, last one wins
    expect(result['X-Custom']).toBe('custom-val');
    expect(result['Authorization']).toBeDefined();
  });

  it('should resolve raw references and add auth schemes once', () => {
    expect(
      getSecretValue({
        storeSecret: {
          [HeaderSecretTypeEnum.Bearer]: { ref: ['node-1', 'token'] },
          'X-Custom': { ref: ['node-1', 'header'] }
        },
        resolveReference: (ref) => (ref[1] === 'token' ? 'token-value' : 'raw-value')
      })
    ).toEqual({
      Authorization: 'Bearer token-value',
      'X-Custom': 'raw-value'
    });
  });

  it('should reject non-scalar header references', () => {
    expect(() =>
      getSecretValue({
        storeSecret: {
          [HeaderSecretTypeEnum.Basic]: { ref: ['node-1', 'credentials'] }
        },
        resolveReference: () => ({ user: 'name' })
      })
    ).toThrow('must resolve to a string');
  });

  it('should reject unresolved references instead of forwarding undefined', () => {
    expect(() =>
      resolveSecretValue({
        value: { ref: ['node-1', 'token'] }
      })
    ).toThrow('requires workflow context');

    expect(() =>
      resolveSecretValue({
        value: { ref: ['node-1', 'token'] },
        resolveReference: () => undefined
      })
    ).toThrow('resolved to undefined');
  });
});

describe('anyValueDecrypt', () => {
  it('should return plain string as-is', () => {
    expect(anyValueDecrypt('hello')).toBe('hello');
  });

  it('should return number as-is', () => {
    expect(anyValueDecrypt(123)).toBe(123);
  });

  it('should return boolean as-is', () => {
    expect(anyValueDecrypt(true)).toBe(true);
  });

  it('should return null as-is', () => {
    expect(anyValueDecrypt(null)).toBe(null);
  });

  it('should decrypt secret object', () => {
    const encrypted = encryptSecret('my-secret');
    const input = { secret: encrypted };

    expect(anyValueDecrypt(input)).toBe('my-secret');
  });

  it('should decrypt deprecated legacy secret objects and JSON strings', () => {
    const legacyValue = { value: '', secret: encryptSecret('legacy-password') };

    expect(anyValueDecrypt(legacyValue)).toBe('legacy-password');
    expect(anyValueDecrypt(JSON.stringify(legacyValue))).toBe('legacy-password');
  });

  it('should resolve a plain value object', () => {
    const input = { value: 'plain-value' };

    expect(anyValueDecrypt(input)).toBe('plain-value');
  });

  it('should decrypt JSON string containing secret object', () => {
    const encrypted = encryptSecret('my-secret');
    const jsonStr = JSON.stringify({ secret: encrypted });

    expect(anyValueDecrypt(jsonStr)).toBe('my-secret');
  });

  it('should resolve a plain value in JSON string', () => {
    const jsonStr = JSON.stringify({ value: 'plain-value' });

    expect(anyValueDecrypt(jsonStr)).toBe('plain-value');
  });

  it('should return plain JSON string as parsed value when not a secret', () => {
    const jsonStr = JSON.stringify({ foo: 'bar' });

    expect(anyValueDecrypt(jsonStr)).toEqual({ foo: 'bar' });
  });

  it('should return non-JSON string as-is', () => {
    expect(anyValueDecrypt('not-json')).toBe('not-json');
  });

  it('should handle JSON string of number', () => {
    expect(anyValueDecrypt('42')).toBe(42);
  });

  it('should handle empty string', () => {
    expect(anyValueDecrypt('')).toBe('');
  });

  it('should handle object with secret but no value', () => {
    const encrypted = encryptSecret('secret-data');
    const input = { secret: encrypted };

    expect(anyValueDecrypt(input)).toBe('secret-data');
  });

  it('should handle encrypt then decrypt round-trip via anyValueDecrypt', () => {
    const original = 'round-trip-test-value';
    const encrypted = encryptSecretValue({ value: original });

    expect(anyValueDecrypt(encrypted)).toBe(original);
  });

  it('should handle JSON-stringified encrypted value', () => {
    const original = 'json-round-trip';
    const encrypted = encryptSecretValue({ value: original });
    const jsonStr = JSON.stringify(encrypted);

    expect(anyValueDecrypt(jsonStr)).toBe(original);
  });
});
