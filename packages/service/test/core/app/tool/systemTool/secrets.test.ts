import { describe, expect, it } from 'vitest';
import { SystemToolSecretMaskedValue } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { decryptSecret, encryptSecret } from '@fastgpt/service/common/secret/aes256gcm';
import {
  decryptSystemToolSecrets,
  encryptSystemToolSecrets,
  getSystemToolSecretKeys,
  maskSystemToolSecrets
} from '@fastgpt/service/core/app/tool/systemTool/secrets';

const secretKeys = new Set(['apiKey']);

describe('system tool secrets', () => {
  it('encrypts new secret values and leaves non-secret config values unchanged', () => {
    const stored = encryptSystemToolSecrets({
      secretsVal: { apiKey: 'new-api-key', region: 'us' },
      secretKeys
    });

    expect(stored).toMatchObject({
      apiKey: { secret: expect.any(String) },
      region: 'us'
    });
    expect(stored.apiKey).not.toBe('new-api-key');
    expect(decryptSystemToolSecrets(stored)).toEqual({
      apiKey: 'new-api-key',
      region: 'us'
    });
  });

  it('preserves an unedited masked value', () => {
    const stored = encryptSystemToolSecrets({
      secretsVal: { apiKey: SystemToolSecretMaskedValue },
      existingSecretsVal: { apiKey: { secret: encryptSecret('api-key') } },
      secretKeys
    });

    expect(stored.apiKey).toMatchObject({ secret: expect.any(String) });
    expect(decryptSecret((stored.apiKey as { secret: string }).secret)).toBe('api-key');
  });

  it('recognizes, masks, preserves, and decrypts deprecated legacy values', () => {
    const legacyValue = { value: '', secret: encryptSecret('legacy-api-key') };
    const legacyJson = JSON.stringify(legacyValue);

    expect(decryptSystemToolSecrets({ apiKey: legacyValue })).toEqual({ apiKey: 'legacy-api-key' });
    expect(decryptSystemToolSecrets({ apiKey: legacyJson })).toEqual({ apiKey: 'legacy-api-key' });
    expect(
      maskSystemToolSecrets({
        secretsVal: { apiKey: legacyValue },
        secretKeys
      })
    ).toEqual({ apiKey: SystemToolSecretMaskedValue });
    expect(
      maskSystemToolSecrets({
        secretsVal: { apiKey: legacyJson },
        secretKeys
      })
    ).toEqual({ apiKey: SystemToolSecretMaskedValue });

    for (const existingValue of [legacyValue, legacyJson]) {
      expect(
        encryptSystemToolSecrets({
          secretsVal: { apiKey: SystemToolSecretMaskedValue },
          existingSecretsVal: { apiKey: existingValue },
          secretKeys
        })
      ).toEqual({ apiKey: { secret: legacyValue.secret } });
    }
  });

  it('recognizes, masks, and re-encrypts deprecated plaintext wrappers', () => {
    const legacyValue = { value: 'legacy-api-key', secret: '' };
    const legacyJson = JSON.stringify(legacyValue);

    for (const existingValue of [legacyValue, legacyJson]) {
      expect(decryptSystemToolSecrets({ apiKey: existingValue })).toEqual({
        apiKey: 'legacy-api-key'
      });
      expect(
        maskSystemToolSecrets({
          secretsVal: { apiKey: existingValue },
          secretKeys
        })
      ).toEqual({ apiKey: SystemToolSecretMaskedValue });

      const submitted = encryptSystemToolSecrets({
        secretsVal: { apiKey: existingValue },
        secretKeys
      });
      expect(submitted).toMatchObject({ apiKey: { secret: expect.any(String) } });
      expect(decryptSystemToolSecrets(submitted)).toEqual({ apiKey: 'legacy-api-key' });

      const stored = encryptSystemToolSecrets({
        secretsVal: { apiKey: SystemToolSecretMaskedValue },
        existingSecretsVal: { apiKey: existingValue },
        secretKeys
      });

      expect(stored).toMatchObject({ apiKey: { secret: expect.any(String) } });
      expect(decryptSystemToolSecrets(stored)).toEqual({ apiKey: 'legacy-api-key' });
    }
  });

  it('prefers the plaintext value when both legacy fields are populated', () => {
    const legacyValue = { value: 'plain-api-key', secret: encryptSecret('cipher-api-key') };

    for (const value of [legacyValue, JSON.stringify(legacyValue)]) {
      expect(decryptSystemToolSecrets({ apiKey: value })).toEqual({ apiKey: 'plain-api-key' });
      expect(
        maskSystemToolSecrets({
          secretsVal: { apiKey: value },
          secretKeys
        })
      ).toEqual({ apiKey: SystemToolSecretMaskedValue });

      const submitted = encryptSystemToolSecrets({
        secretsVal: { apiKey: value },
        secretKeys
      });
      expect(decryptSystemToolSecrets(submitted)).toEqual({ apiKey: 'plain-api-key' });

      const stored = encryptSystemToolSecrets({
        secretsVal: { apiKey: SystemToolSecretMaskedValue },
        existingSecretsVal: { apiKey: value },
        secretKeys
      });
      expect(decryptSystemToolSecrets(stored)).toEqual({ apiKey: 'plain-api-key' });
    }
  });

  it('encrypts a plain secret wrapper and clears an edited empty value', () => {
    const stored = encryptSystemToolSecrets({
      secretsVal: { apiKey: { value: 'new-api-key' } },
      secretKeys
    });

    expect(stored.apiKey).toMatchObject({ secret: expect.any(String) });
    expect(decryptSecret((stored.apiKey as { secret: string }).secret)).toBe('new-api-key');
    expect(
      encryptSystemToolSecrets({
        secretsVal: { apiKey: '' },
        existingSecretsVal: stored,
        secretKeys
      })
    ).toEqual({});
  });

  it('preserves an existing reference when the field is omitted or masked', () => {
    const existing = { ref: ['node-1', 'token'] as [string, string] };

    expect(
      encryptSystemToolSecrets({
        secretsVal: { region: 'us' },
        existingSecretsVal: { apiKey: existing },
        secretKeys
      })
    ).toEqual({ apiKey: existing, region: 'us' });
    expect(
      encryptSystemToolSecrets({
        secretsVal: { apiKey: SystemToolSecretMaskedValue },
        existingSecretsVal: { apiKey: existing },
        secretKeys
      })
    ).toEqual({ apiKey: existing });
  });

  it('masks only configured secret schema fields', () => {
    const masked = maskSystemToolSecrets({
      secretsVal: {
        apiKey: { secret: encryptSecret('api-key') },
        region: 'us'
      },
      secretKeys
    });

    expect(masked).toEqual({
      apiKey: SystemToolSecretMaskedValue,
      region: 'us'
    });
  });

  it('derives secret keys from secret input schema entries', () => {
    expect(
      getSystemToolSecretKeys([
        { key: 'apiKey', label: 'API key', inputType: 'secret' },
        { key: 'region', label: 'Region', inputType: 'select' }
      ])
    ).toEqual(new Set(['apiKey']));
  });
});
