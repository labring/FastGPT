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
