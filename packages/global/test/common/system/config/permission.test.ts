import { describe, expect, it } from 'vitest';
import {
  adminConfigPageFieldsMap,
  countPageVisibleFields
} from '@fastgpt/global/common/system/config/pageFields';
import {
  parseDomainOverrides,
  resolveSystemInstanceConfig
} from '@fastgpt/global/common/system/config/schema';
import {
  getSystemEdition,
  isCommunityEdition,
  isProEdition,
  isConfigFieldAllowed,
  getDomainAllowedKeys,
  filterDomainDataByEdition,
  omitDomainSecrets,
  markDomainSecrets,
  stripDomainSecretMarkers
} from '@fastgpt/global/common/system/config/permission';

describe('Edition detection', () => {
  it('identifies edition strictly by presence of PRO_URL (isProService)', () => {
    expect(isCommunityEdition(false)).toBe(true);
    expect(isCommunityEdition(undefined)).toBe(true);
    expect(isCommunityEdition(true)).toBe(false);

    expect(isProEdition(true)).toBe(true);
    expect(isProEdition(false)).toBe(false);
    expect(isProEdition(undefined)).toBe(false);

    expect(getSystemEdition(false)).toBe('community');
    expect(getSystemEdition(true)).toBe('pro');
  });
});

describe('Field permissions by edition', () => {
  it('hides all account/login controls in community and preserves their unconfigured defaults', () => {
    const page = '/admin/settings/auth';
    expect(
      countPageVisibleFields(page, { edition: 'community', enableSaasAdminConfig: true })
    ).toBe(0);
    expect(countPageVisibleFields(page, { edition: 'pro' })).toBeGreaterThan(0);
    for (const key of [
      'auth.passwordExpiredMonth',
      'security.passwordLoginMinuteLimitCount',
      'security.maxLoginSession'
    ]) {
      expect(isConfigFieldAllowed(key, 'community')).toBe(false);
      expect(isConfigFieldAllowed(key, 'pro')).toBe(true);
    }
    const defaults = resolveSystemInstanceConfig({});
    expect(defaults.auth.passwordExpiredMonth).toBeNull();
    expect(defaults.security).toMatchObject({
      passwordLoginMinuteLimitCount: 10,
      maxLoginSession: 10
    });
  });

  it('allows vector recall concurrency in all editions and reserves cooldown/evaluation limits for Pro', () => {
    for (const field of [
      'resource.exportDatasetLimitMinutes',
      'resource.websiteSyncLimitMinuted',
      'performance.task.evalConcurrency'
    ]) {
      expect(isConfigFieldAllowed(field, 'community'), field).toBe(false);
      expect(isConfigFieldAllowed(field, 'pro'), field).toBe(true);
    }
    expect(isConfigFieldAllowed('vector.vectorRecallConcurrency', 'community')).toBe(true);
    expect(isConfigFieldAllowed('vector.vectorRecallConcurrency', 'pro')).toBe(true);
  });

  it('allows every Agent Sandbox form field in community and pro editions', () => {
    const fields = adminConfigPageFieldsMap['/admin/subservice/agent-sandbox'];
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(isConfigFieldAllowed(field, 'community'), field).toBe(true);
      expect(isConfigFieldAllowed(field, 'pro'), field).toBe(true);
    }
  });

  it('allows general fields in community and pro editions', () => {
    expect(isConfigFieldAllowed('site.publicUrl', 'community')).toBe(true);
    expect(isConfigFieldAllowed('site.publicUrl', 'pro')).toBe(true);
    expect(isConfigFieldAllowed('security.csrfEnabled', 'community')).toBe(true);

    for (const field of [
      'maxFiles',
      'maxSourceSizeMiB',
      'maxConcurrency',
      'prepareTimeoutSeconds'
    ]) {
      expect(isConfigFieldAllowed(`resource.datasetArchive.${field}`, 'community')).toBe(true);
      expect(isConfigFieldAllowed(`resource.datasetArchive.${field}`, 'pro')).toBe(true);
    }
  });

  it('restricts every site information field, including name and logo, to pro edition', () => {
    const fields = adminConfigPageFieldsMap['/admin/settings/site'];
    expect(fields).toContain('site.name');
    expect(fields).toContain('site.favicon');
    for (const field of fields) {
      expect(isConfigFieldAllowed(field, 'community'), field).toBe(false);
      expect(isConfigFieldAllowed(field, 'pro'), field).toBe(true);
    }
  });

  it('restricts feature page fields to Pro but keeps core feature settings editable', () => {
    const fields = adminConfigPageFieldsMap['/admin/settings/feature'];
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(isConfigFieldAllowed(field, 'community'), field).toBe(false);
      expect(isConfigFieldAllowed(field, 'pro'), field).toBe(true);
    }
    expect(getDomainAllowedKeys('feature', 'community')).toEqual(
      new Set(['agentEngine', 'multipleDataToBase64'])
    );
  });

  it('restricts pro-only fields from the community edition', () => {
    // commercial fields are pro-only
    expect(isConfigFieldAllowed('commercial.showCoupon', 'community')).toBe(false);
    expect(isConfigFieldAllowed('commercial.showCoupon', 'pro')).toBe(true);
    expect(isConfigFieldAllowed('commercial.payFormUrl', 'community')).toBe(false);
    expect(isConfigFieldAllowed('commercial.payFormUrl', 'pro')).toBe(true);
    expect(isConfigFieldAllowed('auth.loginProviders.sms.modelDeprecation.zh', 'community')).toBe(
      false
    );
    expect(isConfigFieldAllowed('auth.loginProviders.sms.modelDeprecation.zh', 'pro')).toBe(true);

    // Code Sandbox 属于社区版和商业版共有能力。
    expect(isConfigFieldAllowed('subservice.codeSandbox.enabled', 'community')).toBe(true);
    expect(isConfigFieldAllowed('subservice.codeSandbox.enabled', 'pro')).toBe(true);
  });

  it('retrieves domain-scoped allowed keys for each edition', () => {
    const communityCommercialKeys = getDomainAllowedKeys('commercial', 'community');
    expect(communityCommercialKeys.size).toBe(0);

    const proCommercialKeys = getDomainAllowedKeys('commercial', 'pro');
    expect(proCommercialKeys.has('showCoupon')).toBe(true);
    expect(proCommercialKeys.has('payFormUrl')).toBe(true);

    const siteKeys = getDomainAllowedKeys('site', 'community');
    expect([...siteKeys]).toEqual(['publicUrl']);
  });

  it('filters data payload to prevent pro fields from leaking or writing in community edition', () => {
    // 商业版字段在社区版下被彻底剥离
    const filteredCommercial = filterDomainDataByEdition({
      domain: 'commercial',
      data: {
        showCoupon: true,
        payFormUrl: 'https://pay.example.com'
      },
      edition: 'community'
    });
    expect(filteredCommercial).toEqual({});

    // 商业版环境下完整保留
    const proCommercial = filterDomainDataByEdition({
      domain: 'commercial',
      data: {
        showCoupon: true,
        payFormUrl: 'https://pay.example.com'
      },
      edition: 'pro'
    });
    expect(proCommercial).toEqual({
      showCoupon: true,
      payFormUrl: 'https://pay.example.com'
    });

    // 社区版仅保留核心页的系统访问地址，站点品牌字段由管理接口过滤。
    const filteredSite = filterDomainDataByEdition({
      domain: 'site',
      data: {
        name: 'My Site',
        description: 'Site Description',
        favicon: '/custom-logo.png',
        publicUrl: 'https://fastgpt.example.com'
      },
      edition: 'community'
    });
    expect(filteredSite).toEqual({
      publicUrl: 'https://fastgpt.example.com'
    });
  });
});

describe('configuration secret projection', () => {
  it('returns inline state without values and preserves edition filtering', () => {
    const input = {
      loginProviders: { github: { clientId: 'client-id', secret: 'private-key' } }
    };
    const projected = markDomainSecrets('auth', input);
    expect(projected).toEqual({
      loginProviders: { github: { clientId: 'client-id', secret: { isSecret: true } } }
    });
    expect(
      filterDomainDataByEdition({ domain: 'auth', data: projected, edition: 'community' })
    ).toEqual({});
    expect(filterDomainDataByEdition({ domain: 'auth', data: projected, edition: 'pro' })).toEqual(
      projected
    );
    expect(input.loginProviders.github.secret).toBe('private-key');
    expect(
      markDomainSecrets('providers', {
        documentParse: { customPdf: { key: '', doc2xKey: '  ', price: 2 } }
      })
    ).toEqual({ documentParse: { customPdf: { key: '', doc2xKey: '', price: 2 } } });
  });

  it('accepts only exact markers at registered secret leaves and keeps clear/replace values', () => {
    const data = {
      documentParse: {
        customPdf: {
          key: { isSecret: true },
          doc2xKey: '',
          somarkApiKey: 'new-key'
        }
      }
    };
    expect(stripDomainSecretMarkers('providers', data)).toEqual({
      documentParse: { customPdf: { doc2xKey: '', somarkApiKey: 'new-key' } }
    });
    expect(data.documentParse.customPdf.key).toEqual({ isSecret: true });
    for (const invalid of [
      { isSecret: false },
      { isSecret: 'true' },
      { isSecret: true, secret: 'injected' },
      { isSecret: true, extra: 1 },
      { secret: 'client-cipher' },
      null,
      []
    ]) {
      const overrides = stripDomainSecretMarkers('providers', {
        documentParse: { customPdf: { key: invalid } }
      });
      expect(() => parseDomainOverrides({ domain: 'providers', overrides })).toThrow();
    }
    const nonSecret = stripDomainSecretMarkers('providers', {
      documentParse: { customPdf: { url: { isSecret: true } } }
    });
    expect(nonSecret).toHaveProperty('documentParse.customPdf.url', { isSecret: true });
    expect(() => parseDomainOverrides({ domain: 'providers', overrides: nonSecret })).toThrow();
  });

  it('omits all secret leaves from public projections and form drafts', () => {
    const input = {
      documentParse: { customPdf: { key: 'plain', somarkApiKey: '', doc2xKey: '  ', price: 2 } }
    };
    const projected = omitDomainSecrets('providers', input);
    expect(projected).toEqual({ documentParse: { customPdf: { price: 2 } } });
    expect(input.documentParse.customPdf.key).toBe('plain');
    expect(omitDomainSecrets('site', { name: 'Test' })).toEqual({ name: 'Test' });
  });
});
