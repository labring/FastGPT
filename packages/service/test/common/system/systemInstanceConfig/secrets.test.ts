import { describe, expect, it, vi } from 'vitest';
import { encryptSecret } from '../../../../common/secret/aes256gcm';
import {
  markDomainSecrets,
  stripDomainSecretMarkers
} from '@fastgpt/global/common/system/config/permission';
import { deepMergeConfig } from '@fastgpt/global/common/system/config/merge';
import {
  formatDomainConfigForAdmin,
  findOverridesNotAllowedByEdition
} from '../../../../common/system/systemInstanceConfig/controller';
import { resolveDomainEffectiveConfig } from '@fastgpt/global/common/system/config/schema';
import {
  decryptDomainSecrets,
  encryptDomainSecrets
} from '../../../../common/system/systemInstanceConfig/secrets';

describe('system instance configuration secret codec', () => {
  it('round-trips the admin marker without persisting it or changing the original ciphertext', () => {
    const input = { documentParse: { customPdf: { key: 'owned-secret', price: 2 } } };
    const stored = encryptDomainSecrets({ domain: 'providers', data: input });
    const decoded = decryptDomainSecrets('providers', stored);
    const response = formatDomainConfigForAdmin(
      {
        domain: 'providers',
        revision: 3,
        overrides: decoded,
        effectiveConfig: resolveDomainEffectiveConfig({ domain: 'providers', overrides: decoded })
      },
      'community'
    );
    expect(response.overrides).toHaveProperty('documentParse.customPdf.key', { isSecret: true });
    expect(response.effectiveConfig).toHaveProperty('documentParse.customPdf.key', {
      isSecret: true
    });
    expect(response.effectiveConfig).toHaveProperty('documentParse.customPdf.doc2xKey', '');
    expect(response).not.toHaveProperty('configuredSecretKeys');
    const patch = stripDomainSecretMarkers('providers', response.overrides);
    const merged = deepMergeConfig(decoded, patch);
    const saved = encryptDomainSecrets({
      domain: 'providers',
      data: merged,
      previousStored: stored
    });
    expect(saved).toEqual(stored);
    expect(JSON.stringify(response)).not.toContain('owned-secret');
    expect(JSON.stringify(response)).not.toContain(
      JSON.stringify(stored.documentParse.customPdf.key)
    );
    expect(markDomainSecrets('providers', { documentParse: { customPdf: { key: '' } } })).toEqual({
      documentParse: { customPdf: { key: '' } }
    });
  });

  it('treats secret markers as the original field for edition checks', () => {
    const submittedOverrides = { loginProviders: { github: { secret: { isSecret: true } } } };
    expect(
      findOverridesNotAllowedByEdition({ domain: 'auth', submittedOverrides, edition: 'community' })
    ).toEqual(['loginProviders.github.secret']);
    expect(
      findOverridesNotAllowedByEdition({ domain: 'auth', submittedOverrides, edition: 'pro' })
    ).toEqual([]);
  });

  it('encrypts registered nonempty leaves and decodes them without changing other data', () => {
    const input = {
      documentParse: {
        customPdf: { url: 'https://pdf.example.com', key: 'pdf-secret', doc2xKey: '' }
      },
      unrelated: { secret: 'plain-non-secret', expiresAt: new Date('2030-01-01T00:00:00Z') }
    };
    const stored = encryptDomainSecrets({ domain: 'providers', data: input });
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

    const stored = encryptDomainSecrets({ domain: 'providers', data });
    expect(encryptDomainSecrets({ domain: 'providers', data, previousStored: stored })).toEqual(
      stored
    );
    expect(encryptDomainSecrets({ domain: 'providers', data: stored })).toEqual(stored);

    const replacement = { documentParse: { customPdf: { key: 'replacement' } } };
    const replaced = encryptDomainSecrets({
      domain: 'providers',
      data: replacement,
      previousStored: stored
    });
    expect(replaced.documentParse.customPdf.key).not.toEqual(stored.documentParse.customPdf.key);
    expect(decryptDomainSecrets('providers', replaced)).toEqual(replacement);
  });

  it('preserves malformed credentials and reports only field paths', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const validCipher = encryptSecret('sensitive-value');
    const invalidTag = validCipher.replace(/.$/, validCipher.endsWith('0') ? '1' : '0');
    for (const wrapper of [
      { secret: 'not-a-ciphertext' },
      { secret: validCipher, extra: 'unexpected' },
      { secret: invalidTag },
      7
    ]) {
      const stored = { documentParse: { customPdf: { key: wrapper } } };
      expect(decryptDomainSecrets('providers', stored)).toEqual(stored);
      expect(encryptDomainSecrets({ domain: 'providers', data: stored })).toEqual(stored);
      const replacement = encryptDomainSecrets({
        domain: 'providers',
        data: { documentParse: { customPdf: { key: 'replacement' } } },
        previousStored: stored
      });
      expect(decryptDomainSecrets('providers', replacement).documentParse.customPdf.key).toBe(
        'replacement'
      );
    }
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(validCipher);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('sensitive-value');
    warn.mockRestore();
  });
});
