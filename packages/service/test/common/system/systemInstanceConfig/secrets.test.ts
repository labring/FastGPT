import { describe, expect, it } from 'vitest';
import { encryptSecret } from '../../../../common/secret/aes256gcm';
import {
  decryptDomainSecrets,
  encryptDomainSecrets
} from '../../../../common/system/systemInstanceConfig/secrets';

describe('system instance configuration secret codec', () => {
  it('encrypts registered nonempty leaves and decodes them without changing other data', () => {
    const input = {
      documentParse: {
        customPdf: { url: 'https://pdf.example.com', key: 'pdf-secret', doc2xKey: '' }
      },
      unrelated: { secret: 'plain-non-secret', expiresAt: new Date('2030-01-01T00:00:00Z') }
    };
    const stored = encryptDomainSecrets('providers', input);
    const wrapped = stored.documentParse.customPdf.key as unknown as { secret: string };

    expect(wrapped).toEqual({ secret: expect.any(String) });
    expect(wrapped.secret).not.toContain('pdf-secret');
    expect(stored.documentParse.customPdf.doc2xKey).toBe('');
    expect(stored.unrelated.secret).toBe('plain-non-secret');
    expect(stored.unrelated.expiresAt).toEqual(input.unrelated.expiresAt);
    expect(decryptDomainSecrets('providers', stored)).toEqual(input);
    expect(input.documentParse.customPdf.key).toBe('pdf-secret');
  });

  it('preserves legacy plaintext on read and reuses a previous ciphertext only for the same value', () => {
    const data = { documentParse: { customPdf: { key: 'original' } } };
    expect(decryptDomainSecrets('providers', data)).toEqual(data);

    const stored = encryptDomainSecrets('providers', data);
    expect(encryptDomainSecrets('providers', data, stored)).toEqual(stored);
    expect(encryptDomainSecrets('providers', stored)).toEqual(stored);

    const replacement = { documentParse: { customPdf: { key: 'replacement' } } };
    const replaced = encryptDomainSecrets('providers', replacement, stored);
    expect(replaced.documentParse.customPdf.key).not.toEqual(stored.documentParse.customPdf.key);
    expect(decryptDomainSecrets('providers', replaced)).toEqual(replacement);
  });

  it('rejects malformed or unauthenticated wrappers without exposing their contents', () => {
    const validCipher = encryptSecret('sensitive-value');
    const invalidTag = validCipher.replace(/.$/, validCipher.endsWith('0') ? '1' : '0');
    for (const wrapper of [
      { secret: 'not-a-ciphertext' },
      { secret: validCipher, extra: 'unexpected' },
      { secret: invalidTag }
    ]) {
      const stored = { documentParse: { customPdf: { key: wrapper } } };
      expect(() => decryptDomainSecrets('providers', stored)).toThrow(
        /(?:Invalid stored|Unable to decrypt) configuration secret: providers\.documentParse\.customPdf\.key/
      );
      try {
        decryptDomainSecrets('providers', stored);
      } catch (error) {
        expect(String(error)).not.toContain(validCipher);
        expect(String(error)).not.toContain('sensitive-value');
      }
    }
    expect(() =>
      encryptDomainSecrets('providers', { documentParse: { customPdf: { key: 7 } } })
    ).toThrow('Invalid configuration secret: providers.documentParse.customPdf.key');
  });
});
