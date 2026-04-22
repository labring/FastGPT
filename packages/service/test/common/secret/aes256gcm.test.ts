import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '@fastgpt/service/common/secret/aes256gcm';

describe('encryptSecret', () => {
  it('should return a string in iv:encrypted:authTag format', () => {
    const result = encryptSecret('hello');
    const parts = result.split(':');

    expect(parts).toHaveLength(3);
    // iv is 16 bytes = 32 hex chars
    expect(parts[0]).toHaveLength(32);
    // authTag is 16 bytes = 32 hex chars
    expect(parts[2]).toHaveLength(32);
    // All parts should be valid hex
    parts.forEach((part) => expect(part).toMatch(/^[0-9a-f]+$/));
  });

  it('should produce different ciphertext for the same input (random IV)', () => {
    const a = encryptSecret('same-text');
    const b = encryptSecret('same-text');

    expect(a).not.toBe(b);
  });

  it('should handle empty string', () => {
    const result = encryptSecret('');
    const parts = result.split(':');

    expect(parts).toHaveLength(3);
    // Encrypted part should be empty for empty input
    expect(parts[1]).toBe('');
  });

  it('should handle long strings', () => {
    const longText = 'a'.repeat(10000);
    const result = encryptSecret(longText);

    expect(result.split(':')).toHaveLength(3);
    expect(decryptSecret(result)).toBe(longText);
  });

  it('should handle special characters', () => {
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`"\'\\';
    const result = encryptSecret(special);

    expect(result.split(':')).toHaveLength(3);
  });

  it('should handle unicode and emoji', () => {
    const unicode = '你好世界🔐🗝️';
    const result = encryptSecret(unicode);

    expect(result.split(':')).toHaveLength(3);
  });
});

describe('decryptSecret', () => {
  it('should decrypt back to original text', () => {
    const original = 'my-secret-api-key';
    const encrypted = encryptSecret(original);

    expect(decryptSecret(encrypted)).toBe(original);
  });

  it('should decrypt empty string correctly', () => {
    const encrypted = encryptSecret('');

    expect(decryptSecret(encrypted)).toBe('');
  });

  it('should return empty string for missing iv', () => {
    expect(decryptSecret('')).toBe('');
  });

  it('should return empty string for missing authTag', () => {
    expect(decryptSecret('aabbccdd:eeffaabb')).toBe('');
  });

  it('should return empty string for single segment', () => {
    expect(decryptSecret('only-one-part')).toBe('');
  });

  it('should throw on tampered ciphertext', () => {
    const encrypted = encryptSecret('secret');
    const parts = encrypted.split(':');
    // Flip a byte in the encrypted data
    const tampered = parts[0] + ':' + 'ff' + parts[1].slice(2) + ':' + parts[2];

    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('should throw on tampered authTag', () => {
    const encrypted = encryptSecret('secret');
    const parts = encrypted.split(':');
    const tampered = parts[0] + ':' + parts[1] + ':' + '00'.repeat(16);

    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe('encrypt + decrypt round-trip', () => {
  const cases = [
    'simple text',
    '',
    'a'.repeat(10000),
    '!@#$%^&*()_+-=[]{}|;:,.<>?',
    '你好世界 Hello World',
    '密钥🔑Token🎫',
    'line1\nline2\ttab',
    'Bearer sk-proj-abc123XYZ',
    'Basic dXNlcm5hbWU6cGFzc3dvcmQ='
  ];

  cases.forEach((text) => {
    it(`should round-trip: ${JSON.stringify(text).slice(0, 50)}`, () => {
      expect(decryptSecret(encryptSecret(text))).toBe(text);
    });
  });
});
