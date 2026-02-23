import { describe, it, expect } from 'vitest';
import {
  encryptSecretValue,
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

  it('should return value as-is when value field is empty', () => {
    const input = { value: '', secret: 'existing-secret' };
    const result = encryptSecretValue(input);
    expect(result).toEqual(input);
  });

  it('should encrypt when value field is present', () => {
    const input = { value: 'my-api-key', secret: '' };
    const result = encryptSecretValue(input);

    expect(result.value).toBe('');
    expect(result.secret).toBeTruthy();
    expect(result.secret).not.toBe('my-api-key');
    // Verify the encrypted secret can be decrypted back
    expect(decryptSecret(result.secret)).toBe('my-api-key');
  });

  it('should encrypt and clear value field', () => {
    const input = { value: 'test-token', secret: 'old-secret' };
    const result = encryptSecretValue(input);

    expect(result.value).toBe('');
    expect(decryptSecret(result.secret)).toBe('test-token');
  });

  it('should handle special characters in value', () => {
    const input = { value: 'p@ss!w0rd#$%^&*()', secret: '' };
    const result = encryptSecretValue(input);

    expect(result.value).toBe('');
    expect(decryptSecret(result.secret)).toBe('p@ss!w0rd#$%^&*()');
  });

  it('should handle unicode characters in value', () => {
    const input = { value: '密钥值🔑', secret: '' };
    const result = encryptSecretValue(input);

    expect(result.value).toBe('');
    expect(decryptSecret(result.secret)).toBe('密钥值🔑');
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
      'X-Api-Key': { value: 'key-123', secret: '' },
      'X-Token': { value: 'token-456', secret: '' }
    };
    const result = storeSecretValue(input);

    expect(result['X-Api-Key'].value).toBe('');
    expect(decryptSecret(result['X-Api-Key'].secret)).toBe('key-123');
    expect(result['X-Token'].value).toBe('');
    expect(decryptSecret(result['X-Token'].secret)).toBe('token-456');
  });

  it('should skip encryption for entries with empty value', () => {
    const input = {
      'X-Api-Key': { value: '', secret: 'already-encrypted' }
    };
    const result = storeSecretValue(input);

    expect(result['X-Api-Key']).toEqual({ value: '', secret: 'already-encrypted' });
  });

  it('should handle mixed entries', () => {
    const input = {
      'X-Api-Key': { value: 'new-key', secret: '' },
      'X-Token': { value: '', secret: 'already-encrypted' }
    };
    const result = storeSecretValue(input);

    expect(result['X-Api-Key'].value).toBe('');
    expect(decryptSecret(result['X-Api-Key'].secret)).toBe('new-key');
    expect(result['X-Token']).toEqual({ value: '', secret: 'already-encrypted' });
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
        'X-Api-Key': { value: '', secret: encrypted }
      }
    });

    expect(result).toEqual({ 'X-Api-Key': 'my-api-key' });
  });

  it('should prefer value field over secret field', () => {
    const encrypted = encryptSecret('old-key');
    const result = getSecretValue({
      storeSecret: {
        'X-Api-Key': { value: 'new-key', secret: encrypted }
      }
    });

    expect(result).toEqual({ 'X-Api-Key': 'new-key' });
  });

  it('should convert Bearer type to Authorization header', () => {
    const encrypted = encryptSecret('my-token');
    const result = getSecretValue({
      storeSecret: {
        [HeaderSecretTypeEnum.Bearer]: { value: '', secret: encrypted }
      }
    });

    expect(result).toEqual({ Authorization: 'Bearer my-token' });
  });

  it('should not duplicate Bearer prefix when value already contains it', () => {
    const encrypted = encryptSecret('Bearer my-token');
    const result = getSecretValue({
      storeSecret: {
        [HeaderSecretTypeEnum.Bearer]: { value: '', secret: encrypted }
      }
    });

    expect(result).toEqual({ Authorization: 'Bearer my-token' });
  });

  it('should not duplicate Basic prefix when value already contains it', () => {
    const encrypted = encryptSecret('Basic dXNlcjpwYXNz');
    const result = getSecretValue({
      storeSecret: {
        [HeaderSecretTypeEnum.Basic]: { value: '', secret: encrypted }
      }
    });

    expect(result).toEqual({ Authorization: 'Basic dXNlcjpwYXNz' });
  });

  it('should convert Basic type to Authorization header', () => {
    const encrypted = encryptSecret('dXNlcjpwYXNz');
    const result = getSecretValue({
      storeSecret: {
        [HeaderSecretTypeEnum.Basic]: { value: '', secret: encrypted }
      }
    });

    expect(result).toEqual({ Authorization: 'Basic dXNlcjpwYXNz' });
  });

  it('should handle custom header keys', () => {
    const encrypted = encryptSecret('custom-value');
    const result = getSecretValue({
      storeSecret: {
        'X-Custom-Header': { value: '', secret: encrypted }
      }
    });

    expect(result).toEqual({ 'X-Custom-Header': 'custom-value' });
  });

  it('should filter out entries with empty actual value', () => {
    const result = getSecretValue({
      storeSecret: {
        'X-Api-Key': { value: '', secret: '' }
      }
    });

    expect(result).toEqual({});
  });

  it('should filter out entries with empty key', () => {
    const encrypted = encryptSecret('some-value');
    const result = getSecretValue({
      storeSecret: {
        '': { value: '', secret: encrypted }
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
        [HeaderSecretTypeEnum.Bearer]: { value: '', secret: bearerEncrypted },
        [HeaderSecretTypeEnum.Basic]: { value: '', secret: basicEncrypted },
        'X-Custom': { value: '', secret: customEncrypted }
      }
    });

    // Bearer and Basic both write to Authorization, last one wins
    expect(result['X-Custom']).toBe('custom-val');
    expect(result['Authorization']).toBeDefined();
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
    const input = { secret: encrypted, value: '' };

    expect(anyValueDecrypt(input)).toBe('my-secret');
  });

  it('should prefer value field when present in object', () => {
    const input = { secret: 'some-encrypted', value: 'plain-value' };

    expect(anyValueDecrypt(input)).toBe('plain-value');
  });

  it('should decrypt JSON string containing secret object', () => {
    const encrypted = encryptSecret('my-secret');
    const jsonStr = JSON.stringify({ secret: encrypted, value: '' });

    expect(anyValueDecrypt(jsonStr)).toBe('my-secret');
  });

  it('should prefer value field in JSON string secret object', () => {
    const jsonStr = JSON.stringify({ secret: 'some-encrypted', value: 'plain-value' });

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
    const encrypted = encryptSecretValue({ value: original, secret: '' });
    // encrypted has { secret: '...', value: '' }

    expect(anyValueDecrypt(encrypted)).toBe(original);
  });

  it('should handle JSON-stringified encrypted value', () => {
    const original = 'json-round-trip';
    const encrypted = encryptSecretValue({ value: original, secret: '' });
    const jsonStr = JSON.stringify(encrypted);

    expect(anyValueDecrypt(jsonStr)).toBe(original);
  });
});
