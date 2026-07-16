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
      apiKey: { value: '' },
      region: 'us'
    });
    expect(stored.apiKey).not.toBe('new-api-key');
    expect(decryptSystemToolSecrets(stored)).toEqual({
      apiKey: 'new-api-key',
      region: 'us'
    });
  });

  it('preserves an unedited masked value and migrates legacy plaintext', () => {
    const stored = encryptSystemToolSecrets({
      secretsVal: { apiKey: SystemToolSecretMaskedValue },
      existingSecretsVal: { apiKey: 'legacy-api-key' },
      secretKeys
    });

    expect(stored.apiKey).toMatchObject({ value: '' });
    expect(decryptSecret((stored.apiKey as { secret: string }).secret)).toBe('legacy-api-key');
  });

  it('supports legacy secret wrappers and clears an edited empty value', () => {
    const stored = encryptSystemToolSecrets({
      secretsVal: { apiKey: '' },
      existingSecretsVal: { apiKey: { value: 'legacy-api-key', secret: '' } },
      secretKeys
    });

    expect(stored).toEqual({});
    expect(decryptSystemToolSecrets({ apiKey: { value: 'legacy-api-key', secret: '' } })).toEqual({
      apiKey: 'legacy-api-key'
    });
  });

  it('masks only configured secret schema fields', () => {
    const masked = maskSystemToolSecrets({
      secretsVal: {
        apiKey: { secret: encryptSecret('api-key'), value: '' },
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
