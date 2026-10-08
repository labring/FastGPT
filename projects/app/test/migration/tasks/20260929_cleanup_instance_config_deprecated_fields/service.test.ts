import { describe, expect, it } from 'vitest';
import {
  deprecatedOverridePaths,
  hasDeprecatedOverrides,
  stripDeprecatedOverrides
} from '@/migration/tasks/20260929_cleanup_instance_config_deprecated_fields/service';

describe('deprecatedOverridePaths', () => {
  it('covers every field removed from the instance config schemas', () => {
    const paths = Object.entries(deprecatedOverridePaths).flatMap(([domain, list]) =>
      (list ?? []).map((path) => `${domain}.${path.join('.')}`)
    );

    expect(paths).toEqual(
      expect.arrayContaining([
        'site.chineseRedirectUrl',
        'site.systemTitle',
        'performance.chat.logUrl',
        'performance.chat.logInterval',
        'performance.chat.logSourceIdPrefix',
        'storage.downloadRedirectTtlSeconds',
        'storage.downloadRedirectEndpoint',
        'feature.showWorkorder',
        'feature.showEnterpriseAuth',
        'vector.vqLevel',
        'vector.languageIdentifier',
        'providers.chunk',
        'providers.crm',
        'auth.loginProviders.sms.login.en',
        'auth.accountCancellation.cancellationSm.en',
        'commercial.billingNotify.paymentReceived.en'
      ])
    );
  });
});

describe('stripDeprecatedOverrides', () => {
  it('removes deprecated leaf fields and keeps the rest untouched', () => {
    const { overrides, removedFieldCount } = stripDeprecatedOverrides('vector', {
      vqLevel: 16,
      languageIdentifier: 'whatlang',
      hnswEfSearch: 200
    });

    expect(overrides).toEqual({ hnswEfSearch: 200 });
    expect(removedFieldCount).toBe(2);
  });

  it('drops parent objects that become empty after cleanup', () => {
    const { overrides } = stripDeprecatedOverrides('performance', {
      chat: { maxQpm: 100, logUrl: 'http://log', logInterval: 5000, logSourceIdPrefix: 'p-' },
      workflow: { maxRunTimes: 700 }
    });

    expect(overrides).toEqual({
      chat: { maxQpm: 100 },
      workflow: { maxRunTimes: 700 }
    });
  });

  it('removes an emptied nested chain across multiple deprecated siblings', () => {
    const { overrides, removedFieldCount } = stripDeprecatedOverrides('auth', {
      loginProviders: {
        sms: {
          login: { zh: '登录', en: 'login' },
          register: { zh: '注册', en: 'register' }
        }
      }
    });

    expect(overrides).toEqual({
      loginProviders: { sms: { login: { zh: '登录' }, register: { zh: '注册' } } }
    });
    expect(removedFieldCount).toBe(2);
  });

  it('removes the whole branch when nothing remains', () => {
    const { overrides } = stripDeprecatedOverrides('providers', {
      chunk: { url: 'https://chunk.example.com', timeoutMinutes: 60 },
      crm: { apiUrl: 'https://crm.example.com' }
    });

    expect(overrides).toEqual({});
  });

  it('is idempotent and does not mutate the input', () => {
    const input = { vqLevel: 32, hnswEfSearch: 100 };

    const first = stripDeprecatedOverrides('vector', input);
    const second = stripDeprecatedOverrides('vector', first.overrides);

    expect(input).toEqual({ vqLevel: 32, hnswEfSearch: 100 });
    expect(second).toEqual({ overrides: { hnswEfSearch: 100 }, removedFieldCount: 0 });
  });

  it('returns zero removals for domains without deprecated fields', () => {
    const { overrides, removedFieldCount } = stripDeprecatedOverrides('security', {
      csrfEnabled: true
    });

    expect(overrides).toEqual({ csrfEnabled: true });
    expect(removedFieldCount).toBe(0);
  });
});

describe('hasDeprecatedOverrides', () => {
  it('detects deprecated fields at any depth', () => {
    expect(hasDeprecatedOverrides('storage', { downloadRedirectTtlSeconds: 300 })).toBe(true);
    expect(
      hasDeprecatedOverrides('commercial', { billingNotify: { expired: { zh: 'x', en: 'y' } } })
    ).toBe(true);
  });

  it('returns false when only supported fields remain', () => {
    expect(hasDeprecatedOverrides('storage', { fileUrlExpiredDays: 90 })).toBe(false);
    expect(hasDeprecatedOverrides('site', { name: 'AI' })).toBe(false);
    expect(hasDeprecatedOverrides('site', {})).toBe(false);
  });

  it('ignores deprecated fields listed for a different domain', () => {
    // vqLevel 属于 vector，不应在 site 下被判定为残留
    expect(hasDeprecatedOverrides('site', { vqLevel: 32 })).toBe(false);
  });
});
