import { assert, describe, expect, it } from 'vitest';
import { SystemToolSecretMaskedValue } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { encryptSecret } from '@fastgpt/service/common/secret/aes256gcm';
import {
  decryptSystemToolSecrets,
  encryptSystemToolSecrets,
  getSystemToolSecretKeys,
  maskSystemToolSecrets
} from '@fastgpt/service/core/app/tool/systemTool/secrets';

const secretKeys = new Set(['apiKey']);

describe('getSystemToolSecretKeys', () => {
  it('selects secret declarations and accepts missing input lists', () => {
    expect(
      getSystemToolSecretKeys([
        { key: 'apiKey', label: 'API key', inputType: 'secret' },
        { key: 'region', label: 'Region', inputType: 'select' }
      ])
    ).toEqual(secretKeys);
    expect(getSystemToolSecretKeys()).toEqual(new Set());
  });
});

describe('encryptSystemToolSecrets', () => {
  it.each(['cipher', 'plain', 'replacement'] as const)(
    'masks, reads, and resaves legacy %s wrappers with the same precedence',
    (kind) => {
      const cipher = encryptSecret('cipher-key');
      const legacy = {
        value: kind === 'cipher' ? '' : 'plain-key',
        secret: kind === 'plain' ? '' : cipher
      };
      const expected = kind === 'cipher' ? 'cipher-key' : 'plain-key';
      for (const value of [legacy, JSON.stringify(legacy)]) {
        const existingSecretsVal = { apiKey: value };
        expect(decryptSystemToolSecrets(existingSecretsVal)).toEqual({ apiKey: expected });
        const masked = maskSystemToolSecrets({ secretsVal: existingSecretsVal, secretKeys });
        expect(masked).toEqual({ apiKey: SystemToolSecretMaskedValue });
        for (const submitted of [existingSecretsVal, masked]) {
          const stored = encryptSystemToolSecrets({
            secretsVal: submitted,
            existingSecretsVal,
            secretKeys
          });
          assert(stored);
          expect(stored).toEqual({ apiKey: { secret: expect.any(String) } });
          expect(decryptSystemToolSecrets(stored)).toEqual({ apiKey: expected });
          if (kind === 'cipher') expect(stored.apiKey).toEqual({ secret: cipher });
        }
      }
    }
  );

  it('merges patches and encrypts omitted plaintext while preserving non-secret fields', () => {
    const stored = encryptSystemToolSecrets({
      secretsVal: { region: 'us' },
      existingSecretsVal: { apiKey: 'legacy-plain', unchanged: false },
      secretKeys
    });
    assert(stored);
    expect(stored).toEqual({
      apiKey: { secret: expect.any(String) },
      region: 'us',
      unchanged: false
    });
    expect(decryptSystemToolSecrets(stored)).toEqual({
      apiKey: 'legacy-plain',
      region: 'us',
      unchanged: false
    });
    expect(encryptSystemToolSecrets({ secretsVal: { apiKey: 'new-key' }, secretKeys })).toEqual({
      apiKey: { secret: expect.any(String) }
    });
  });

  it('distinguishes clearing a submitted value from omitting or saving an empty wrapper', () => {
    const existingSecretsVal = { apiKey: { secret: encryptSecret('old') } };
    for (const value of ['', null, undefined]) {
      expect(
        encryptSystemToolSecrets({ secretsVal: { apiKey: value }, existingSecretsVal, secretKeys })
      ).toEqual({});
    }
    const stored = encryptSystemToolSecrets({
      secretsVal: { apiKey: { value: '' } },
      existingSecretsVal,
      secretKeys
    });
    assert(stored);
    expect(stored).toEqual({ apiKey: { value: '' } });
    expect(maskSystemToolSecrets({ secretsVal: stored, secretKeys })).toEqual(stored);
    expect(
      encryptSystemToolSecrets({ secretsVal: {}, existingSecretsVal: { apiKey: '' }, secretKeys })
    ).toEqual({ apiKey: { value: '' } });
    expect(
      encryptSystemToolSecrets({ secretsVal: null, existingSecretsVal, secretKeys })
    ).toBeNull();
    expect(encryptSystemToolSecrets({ existingSecretsVal, secretKeys })).toBeUndefined();
  });

  it('preserves configured masked credentials and drops missing, empty, or invalid ones', () => {
    const reference = { ref: ['node', 'token'] as [string, string] };
    for (const value of [{ secret: encryptSecret('old') }, reference]) {
      expect(
        encryptSystemToolSecrets({
          secretsVal: { apiKey: SystemToolSecretMaskedValue },
          existingSecretsVal: { apiKey: value },
          secretKeys
        })
      ).toEqual({ apiKey: value });
    }
    for (const value of [
      undefined,
      SystemToolSecretMaskedValue,
      { value: '' },
      { ref: [] },
      { ref: ['node', 'token'], value: 'plain' }
    ]) {
      expect(
        encryptSystemToolSecrets({
          secretsVal: { apiKey: SystemToolSecretMaskedValue },
          existingSecretsVal: { apiKey: value },
          secretKeys
        })
      ).toEqual({});
    }
    expect(encryptSystemToolSecrets({ secretsVal: { apiKey: { ref: [] } }, secretKeys })).toEqual(
      {}
    );
    expect(
      encryptSystemToolSecrets({
        secretsVal: {},
        existingSecretsVal: { apiKey: reference },
        secretKeys
      })
    ).toEqual({ apiKey: reference });
  });
});

describe('maskSystemToolSecrets', () => {
  it('masks only configured static secrets and preserves reference and empty states', () => {
    const secretsVal = {
      apiKey: { secret: encryptSecret('key') },
      reference: { ref: ['node', 'token'] },
      empty: { value: '' },
      invalid: { ref: [] },
      sentinel: SystemToolSecretMaskedValue,
      region: 'us'
    };
    expect(
      maskSystemToolSecrets({
        secretsVal,
        secretKeys: new Set(['apiKey', 'reference', 'empty', 'invalid', 'sentinel'])
      })
    ).toEqual({
      apiKey: SystemToolSecretMaskedValue,
      reference: secretsVal.reference,
      empty: { value: '' },
      invalid: '',
      sentinel: '',
      region: 'us'
    });
    expect(maskSystemToolSecrets({ secretKeys })).toBeUndefined();
  });
});

describe('decryptSystemToolSecrets', () => {
  it('keeps its error policy and omits the admin mask sentinel', () => {
    const cipher = encryptSecret('plain');
    const tampered = cipher.slice(0, -1) + (cipher.endsWith('0') ? '1' : '0');
    expect(
      decryptSystemToolSecrets({
        apiKey: { secret: tampered },
        masked: SystemToolSecretMaskedValue,
        plain: { value: 'new' },
        region: 'us'
      })
    ).toEqual({ apiKey: '', plain: 'new', region: 'us' });
    expect(decryptSystemToolSecrets()).toBeUndefined();
  });
});
