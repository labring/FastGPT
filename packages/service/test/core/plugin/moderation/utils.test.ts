import { describe, expect, it } from 'vitest';
import {
  decryptModerationSecrets,
  encryptModerationSecrets,
  getModerationSecretKeys,
  hasConfiguredModerationSecrets,
  maskModerationSecrets,
  mergeModerationSecretsForUpdate
} from '../../../../core/plugin/moderation/utils';
import {
  formatModerationLabel,
  ModerationSecretMaskedValue
} from '@fastgpt/global/core/plugin/moderation/constants';

/** 测试用可逆加解密，避免依赖 AES 密钥环境 */
const fakeEncrypt = (plain: string) => `enc:${plain}`;
const fakeDecrypt = (cipher: string) => {
  if (!cipher.startsWith('enc:')) throw new Error('bad cipher');
  return cipher.slice(4);
};

/** 与插件模板一致：扁平一层，isSecret 标记密钥字段 */
const secretSchema = {
  type: 'object',
  properties: {
    accessKeyId: { type: 'string', isSecret: true },
    accessKeySecret: { type: 'string', isSecret: true },
    strategyId: { type: 'string', isSecret: false }
  }
};

describe('getModerationSecretKeys', () => {
  it('returns only fields marked isSecret', () => {
    expect([...getModerationSecretKeys(secretSchema)].sort()).toEqual([
      'accessKeyId',
      'accessKeySecret'
    ]);
  });

  it('returns an empty set for missing or malformed schema', () => {
    expect(getModerationSecretKeys(undefined).size).toBe(0);
    expect(getModerationSecretKeys(null).size).toBe(0);
    expect(getModerationSecretKeys('not-an-object').size).toBe(0);
    expect(getModerationSecretKeys({ type: 'object' }).size).toBe(0);
  });

  it('treats only isSecret === true as secret', () => {
    const keys = getModerationSecretKeys({
      properties: {
        a: { isSecret: true },
        b: { isSecret: 'true' },
        c: { isSecret: 1 },
        d: {}
      }
    });
    expect([...keys]).toEqual(['a']);
  });
});

describe('maskModerationSecrets', () => {
  const secretKeys = getModerationSecretKeys(secretSchema);

  it('masks configured secret fields and keeps plain fields visible', () => {
    const masked = maskModerationSecrets({
      secretsVal: {
        accessKeyId: { secret: 'cipher-1' },
        accessKeySecret: { secret: 'cipher-2' },
        strategyId: 'strategy-abc'
      },
      secretKeys
    });

    expect(masked).toEqual({
      accessKeyId: ModerationSecretMaskedValue,
      accessKeySecret: ModerationSecretMaskedValue,
      strategyId: 'strategy-abc'
    });
  });

  it('never leaks the ciphertext to callers', () => {
    const masked = maskModerationSecrets({
      secretsVal: { accessKeyId: { secret: 'cipher-1' } },
      secretKeys
    });
    expect(JSON.stringify(masked)).not.toContain('cipher-1');
  });

  it('leaves empty secret fields untouched', () => {
    const masked = maskModerationSecrets({
      secretsVal: { accessKeyId: '' },
      secretKeys
    });
    expect(masked).toEqual({ accessKeyId: '' });
  });
});

describe('hasConfiguredModerationSecrets', () => {
  const secretKeys = getModerationSecretKeys(secretSchema);

  it('is true only when at least one secret field has a value', () => {
    expect(
      hasConfiguredModerationSecrets({ secretsVal: { accessKeyId: { secret: 'x' } }, secretKeys })
    ).toBe(true);
    expect(hasConfiguredModerationSecrets({ secretsVal: {}, secretKeys })).toBe(false);
    expect(hasConfiguredModerationSecrets({ secretsVal: undefined, secretKeys })).toBe(false);
    // 只有非密钥字段配置了，在插件声明了密钥时，不算「已配置密钥」
    expect(
      hasConfiguredModerationSecrets({ secretsVal: { strategyId: 'abc' }, secretKeys })
    ).toBe(false);

    // 当插件未声明任何密钥字段时（例如关键词插件），配置了普通字段即算已配置
    expect(
      hasConfiguredModerationSecrets({
        secretsVal: { blockedKeywords: 'bad' },
        secretKeys: new Set()
      })
    ).toBe(true);
  });
});

describe('mergeModerationSecretsForUpdate', () => {
  const secretKeys = getModerationSecretKeys(secretSchema);

  it('keeps the stored ciphertext when the incoming value is the masked placeholder', () => {
    const merged = mergeModerationSecretsForUpdate({
      incoming: { accessKeyId: ModerationSecretMaskedValue, strategyId: 'new-strategy' },
      existing: { accessKeyId: { secret: 'old-cipher' }, strategyId: 'old-strategy' },
      secretKeys
    });

    expect(merged.accessKeyId).toEqual({ secret: 'old-cipher' });
    expect(merged.strategyId).toBe('new-strategy');
  });

  it('deletes a secret field when the user clears it explicitly', () => {
    const merged = mergeModerationSecretsForUpdate({
      incoming: { accessKeyId: '' },
      existing: { accessKeyId: { secret: 'old-cipher' } },
      secretKeys
    });

    expect(merged).not.toHaveProperty('accessKeyId');
  });

  it('drops the masked placeholder when nothing was stored yet', () => {
    const merged = mergeModerationSecretsForUpdate({
      incoming: { accessKeyId: ModerationSecretMaskedValue },
      existing: undefined,
      secretKeys
    });

    expect(merged).not.toHaveProperty('accessKeyId');
  });

  it('returns the existing values unchanged when the payload omits secretsVal', () => {
    const existing = { accessKeyId: { secret: 'old-cipher' } };
    const merged = mergeModerationSecretsForUpdate({ incoming: undefined, existing, secretKeys });

    expect(merged).toEqual(existing);
  });
});

describe('encryptModerationSecrets', () => {
  const secretKeys = getModerationSecretKeys(secretSchema);

  it('encrypts secret fields and leaves plain fields as-is', () => {
    const encrypted = encryptModerationSecrets({
      secretsVal: { accessKeyId: 'plain-key', strategyId: 'strategy-abc' },
      secretKeys,
      encrypt: fakeEncrypt
    });

    expect(encrypted).toEqual({
      accessKeyId: { secret: 'enc:plain-key' },
      strategyId: 'strategy-abc'
    });
  });

  it('does not double-encrypt an already encrypted value', () => {
    const encrypted = encryptModerationSecrets({
      secretsVal: { accessKeyId: { secret: 'enc:plain-key' } },
      secretKeys,
      encrypt: fakeEncrypt
    });

    expect(encrypted).toEqual({ accessKeyId: { secret: 'enc:plain-key' } });
  });

  it('drops empty secret fields', () => {
    const encrypted = encryptModerationSecrets({
      secretsVal: { accessKeyId: '', accessKeySecret: null },
      secretKeys,
      encrypt: fakeEncrypt
    });

    expect(encrypted).toEqual({});
  });
});

describe('decryptModerationSecrets', () => {
  const secretKeys = getModerationSecretKeys(secretSchema);

  it('round-trips through encrypt and decrypt', () => {
    const encrypted = encryptModerationSecrets({
      secretsVal: { accessKeyId: 'plain-key', strategyId: 'strategy-abc' },
      secretKeys,
      encrypt: fakeEncrypt
    });
    const decrypted = decryptModerationSecrets({
      secretsVal: encrypted,
      secretKeys,
      decrypt: fakeDecrypt
    });

    expect(decrypted).toEqual({ accessKeyId: 'plain-key', strategyId: 'strategy-abc' });
  });

  it('drops a field whose ciphertext cannot be decrypted instead of failing', () => {
    const decrypted = decryptModerationSecrets({
      secretsVal: { accessKeyId: { secret: 'corrupted' } },
      secretKeys,
      decrypt: fakeDecrypt
    });

    expect(decrypted).toEqual({});
  });

  it('drops the masked placeholder so it never reaches a provider', () => {
    const decrypted = decryptModerationSecrets({
      secretsVal: { accessKeyId: ModerationSecretMaskedValue },
      secretKeys,
      decrypt: fakeDecrypt
    });

    expect(decrypted).toEqual({});
  });
});

describe('formatModerationLabel', () => {
  it('formats standard normalized labels with fallback to default Chinese', () => {
    expect(formatModerationLabel('politics')).toBe('涉政');
    expect(formatModerationLabel('porn')).toBe('色情');
    expect(formatModerationLabel('terror')).toBe('暴恐');
    expect(formatModerationLabel('contraband')).toBe('违禁');
    expect(formatModerationLabel('unknown-label')).toBe('unknown-label');
  });

  it('uses translation function t when available', () => {
    const mockT = (key: string) => {
      if (key === 'admin:moderation.label.politics') return 'Politics';
      if (key === 'admin:moderation.label.porn') return 'Pornography';
      return key;
    };

    expect(formatModerationLabel('politics', mockT)).toBe('Politics');
    expect(formatModerationLabel('porn', mockT)).toBe('Pornography');
    expect(formatModerationLabel('other', mockT)).toBe('其他');
  });
});
